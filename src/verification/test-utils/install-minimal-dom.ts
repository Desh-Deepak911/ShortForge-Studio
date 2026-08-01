/**
 * Minimal DOM bootstrap for rendered React event-sequence regressions.
 * Install BEFORE importing react-dom/client.
 */

type AnyFn = (...args: unknown[]) => unknown;

function installMinimalDom(): { document: Document; window: Window & typeof globalThis } {
  const listenerMap = new WeakMap<object, Record<string, AnyFn[]>>();

  class EventTarget {
    addEventListener(type: string, fn: AnyFn) {
      let map = listenerMap.get(this);
      if (!map) {
        map = {};
        listenerMap.set(this, map);
      }
      (map[type] ||= []).push(fn);
    }
    removeEventListener(type: string, fn: AnyFn) {
      const map = listenerMap.get(this);
      if (!map?.[type]) return;
      map[type] = map[type]!.filter((entry) => entry !== fn);
    }
    dispatchEvent(ev: {
      type: string;
      target?: unknown;
      currentTarget?: unknown;
      bubbles?: boolean;
      defaultPrevented?: boolean;
      preventDefault?: () => void;
      stopPropagation?: () => void;
      _stopped?: boolean;
    }) {
      const event = ev;
      if (!event.preventDefault) {
        event.preventDefault = () => {
          event.defaultPrevented = true;
        };
      }
      if (!event.stopPropagation) {
        event.stopPropagation = () => {
          event._stopped = true;
        };
      }
      Object.defineProperty(event, "target", {
        value: event.target ?? this,
        configurable: true,
      });

      // Bubble so React 17+ root delegation receives the event.
      let node: EventTarget | null = null;
      for (
        node = this as EventTarget;
        node && !event._stopped;
        node = (node as { parentNode?: EventTarget | null }).parentNode ?? null
      ) {
        Object.defineProperty(event, "currentTarget", {
          value: node,
          configurable: true,
        });
        const map = listenerMap.get(node);
        for (const fn of map?.[event.type] ?? []) {
          fn.call(node, event);
        }
        if (!event.bubbles) break;
      }
      return true;
    }
  }

  class DomNode extends EventTarget {
    childNodes: DomNode[] = [];
    parentNode: DomNode | null = null;
    ownerDocument: DomDocument | null = null;
    nodeType = 1;
    nodeName = "";
    get textContent(): string {
      return "";
    }
    set textContent(_value: string) {}
    appendChild(child: DomNode): DomNode {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child: DomNode): DomNode {
      this.childNodes = this.childNodes.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    }
    insertBefore(child: DomNode, ref: DomNode | null): DomNode {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (!ref) {
        this.childNodes.push(child);
        return child;
      }
      const index = this.childNodes.indexOf(ref);
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
      return child;
    }
    get firstChild(): DomNode | null {
      return this.childNodes[0] ?? null;
    }
    get lastChild(): DomNode | null {
      return this.childNodes[this.childNodes.length - 1] ?? null;
    }
    get nextSibling(): DomNode | null {
      if (!this.parentNode) return null;
      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index + 1] ?? null;
    }
    get previousSibling(): DomNode | null {
      if (!this.parentNode) return null;
      const index = this.parentNode.childNodes.indexOf(this);
      return this.parentNode.childNodes[index - 1] ?? null;
    }
    contains(other: DomNode | null): boolean {
      let node: DomNode | null = other;
      while (node) {
        if (node === this) return true;
        node = node.parentNode;
      }
      return false;
    }
    cloneNode(_deep?: boolean): DomNode {
      void _deep;
      return new DomNode();
    }
  }

  class DomText extends DomNode {
    data: string;
    constructor(data: string) {
      super();
      this.nodeType = 3;
      this.nodeName = "#text";
      this.data = String(data);
    }
    override get textContent(): string {
      return this.data;
    }
    override set textContent(value: string) {
      this.data = String(value);
    }
    override cloneNode(): DomText {
      return new DomText(this.data);
    }
  }

  class DomElement extends DomNode {
    tagName: string;
    namespaceURI = "http://www.w3.org/1999/xhtml";
    style: Record<string, string> = {};
    attributes: Record<string, string> = Object.create(null);
    className = "";
    _value = "";
    tabIndex = -1;
    isConnected = true;
    type?: string;

    constructor(tag: string) {
      super();
      this.nodeType = 1;
      this.tagName = String(tag).toUpperCase();
      this.nodeName = this.tagName;
    }

    setAttribute(name: string, value: string) {
      this.attributes[name] = String(value);
      if (name === "class") this.className = String(value);
      if (name === "value") this._value = String(value);
    }
    getAttribute(name: string) {
      return name in this.attributes ? this.attributes[name]! : null;
    }
    hasAttribute(name: string) {
      return name in this.attributes;
    }
    removeAttribute(name: string) {
      delete this.attributes[name];
    }
    getAttributeNS() {
      return null;
    }
    setAttributeNS(_ns: string, name: string, value: string) {
      this.setAttribute(name, value);
    }
    removeAttributeNS(_ns: string, name: string) {
      this.removeAttribute(name);
    }
    get classList() {
      return {
        add: (...tokens: string[]) => {
          this.className = [
            ...new Set(
              `${this.className || ""}`
                .split(/\s+/)
                .filter(Boolean)
                .concat(tokens),
            ),
          ].join(" ");
        },
        remove: (...tokens: string[]) => {
          const drop = new Set(tokens);
          this.className = `${this.className || ""}`
            .split(/\s+/)
            .filter((token) => token && !drop.has(token))
            .join(" ");
        },
        contains: (token: string) => {
          return `${this.className || ""}`.split(/\s+/).includes(token);
        },
        toggle: (token: string, force?: boolean) => {
          const has = `${this.className || ""}`.split(/\s+/).includes(token);
          if (force ?? !has) {
            this.className = [
              ...new Set(
                `${this.className || ""}`
                  .split(/\s+/)
                  .filter(Boolean)
                  .concat(token),
              ),
            ].join(" ");
          } else {
            this.className = `${this.className || ""}`
              .split(/\s+/)
              .filter((entry) => entry && entry !== token)
              .join(" ");
          }
        },
      };
    }
    get value() {
      return this._value;
    }
    set value(next: string) {
      this._value = String(next);
      this.attributes.value = String(next);
    }
    override get textContent() {
      return this.childNodes.map((child) => child.textContent || "").join("");
    }
    override set textContent(value: string) {
      this.childNodes = [];
      if (value) this.appendChild(this.ownerDocument!.createTextNode(value));
    }
    get innerHTML() {
      return this.textContent;
    }
    set innerHTML(value: string) {
      this.textContent = value;
    }
    focus() {
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }
    blur() {
      this.dispatchEvent({ type: "blur", bubbles: false });
      if (this.ownerDocument?.activeElement === this) {
        this.ownerDocument.activeElement = this.ownerDocument.body;
      }
    }
    getBoundingClientRect() {
      return {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      };
    }
    querySelector(selector: string) {
      return this.ownerDocument?.querySelector(selector) ?? null;
    }
    querySelectorAll(selector: string) {
      return this.ownerDocument?.querySelectorAll(selector) ?? [];
    }
    closest() {
      return null;
    }
    override cloneNode(deep = false): DomElement {
      const clone = this.ownerDocument!.createElement(this.tagName.toLowerCase());
      for (const [key, value] of Object.entries(this.attributes)) {
        clone.setAttribute(key, value);
      }
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.cloneNode(true));
        }
      }
      return clone;
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    }
  }

  class DomDocument extends EventTarget {
    nodeType = 9;
    nodeName = "#document";
    HTMLElement = DomElement;
    HTMLInputElement = DomElement;
    HTMLIFrameElement = DomElement;
    Element = DomElement;
    Node = DomNode;
    Text = DomText;
    DocumentFragment = class DomFragment extends DomNode {
      constructor() {
        super();
        this.nodeType = 11;
        this.nodeName = "#document-fragment";
      }
    };
    documentElement: DomElement;
    head: DomElement;
    body: DomElement;
    activeElement: DomElement;
    defaultView: unknown = null;

    constructor() {
      super();
      this.documentElement = new DomElement("html");
      this.documentElement.ownerDocument = this;
      this.head = new DomElement("head");
      this.head.ownerDocument = this;
      this.body = new DomElement("body");
      this.body.ownerDocument = this;
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);
      this.activeElement = this.body;
    }

    createElement(tag: string) {
      const el = new DomElement(tag);
      el.ownerDocument = this;
      if (String(tag).toLowerCase() === "input") {
        el.type = "text";
      }
      return el;
    }
    createElementNS(ns: string, tag: string) {
      const el = this.createElement(tag);
      el.namespaceURI = ns;
      return el;
    }
    createTextNode(data: string) {
      const text = new DomText(data);
      text.ownerDocument = this;
      return text;
    }
    createDocumentFragment() {
      const fragment = new this.DocumentFragment();
      fragment.ownerDocument = this;
      return fragment;
    }
    getElementById() {
      return null;
    }
    querySelector(selector: string): DomElement | null {
      const walk = (node: DomNode, acc: DomNode[] = []) => {
        acc.push(node);
        for (const child of node.childNodes) walk(child, acc);
        return acc;
      };
      // Scope walks to this document's body (and descendants), which includes
      // portals only when they are parented under body in richer DOMs.
      const all = walk(this.body);
      const attrEq = selector.match(/\[([^=\]]+)="([^"]*)"\]/);
      if (attrEq) {
        return (
          (all.find(
            (node) =>
              node instanceof DomElement &&
              node.getAttribute(attrEq[1]!) === attrEq[2],
          ) as DomElement | undefined) ?? null
        );
      }
      const attrPresent = selector.match(/^\[([^=\]]+)\]$/);
      if (attrPresent) {
        return (
          (all.find(
            (node) =>
              node instanceof DomElement &&
              node.hasAttribute(attrPresent[1]!),
          ) as DomElement | undefined) ?? null
        );
      }
      if (selector === "input") {
        return (
          (all.find(
            (node) => node instanceof DomElement && node.tagName === "INPUT",
          ) as DomElement | undefined) ?? null
        );
      }
      return null;
    }
    querySelectorAll(selector: string) {
      const one = this.querySelector(selector);
      return one ? [one] : [];
    }
  }

  const document = new DomDocument() as unknown as Document;
  const window = {
    document,
    HTMLElement: DomElement,
    HTMLInputElement: DomElement,
    HTMLIFrameElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    Text: DomText,
    DocumentFragment: (document as unknown as DomDocument).DocumentFragment,
    SVGElement: DomElement,
    navigator: { userAgent: "node-minimal-dom" },
    getComputedStyle() {
      return { getPropertyValue() { return ""; } };
    },
    requestAnimationFrame(cb: (time: number) => void) {
      return setTimeout(() => cb(Date.now()), 0) as unknown as number;
    },
    cancelAnimationFrame(id: number) {
      clearTimeout(id);
    },
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    addEventListener() {},
    removeEventListener() {},
    location: { href: "http://localhost/" },
    self: null as unknown,
    top: null as unknown,
    window: null as unknown,
  };
  window.self = window;
  window.top = window;
  window.window = window;
  (document as unknown as DomDocument).defaultView = window;

  const assign = (key: string, value: unknown) => {
    try {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore non-configurable host properties (e.g. navigator)
    }
  };

  assign("window", window);
  assign("document", document);
  assign("HTMLElement", DomElement);
  assign("HTMLInputElement", DomElement);
  assign("HTMLIFrameElement", DomElement);
  assign("Element", DomElement);
  assign("Node", DomNode);
  assign("Text", DomText);
  assign("DocumentFragment", (document as unknown as DomDocument).DocumentFragment);
  assign("SVGElement", DomElement);
  assign("requestAnimationFrame", window.requestAnimationFrame);
  assign("cancelAnimationFrame", window.cancelAnimationFrame);
  assign("IS_REACT_ACT_ENVIRONMENT", true);

  return {
    document,
    window: window as unknown as Window & typeof globalThis,
  };
}

const installed = installMinimalDom();

export const minimalDocument = installed.document;
export const minimalWindow = installed.window;
