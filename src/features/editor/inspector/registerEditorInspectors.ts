import CaptionInspector from "./panels/CaptionInspector";
import ImageInspector from "./panels/ImageInspector";
import ProjectInspector from "./panels/ProjectInspector";
import SceneInspector from "./panels/SceneInspector";
import TransitionInspector from "./panels/TransitionInspector";
import { InspectorRegistry } from "./InspectorRegistry";

export function createEditorInspectorRegistry(): InspectorRegistry {
  return new InspectorRegistry()
    .register({ id: "scene", component: SceneInspector, order: 10 })
    .register({ id: "image", component: ImageInspector, order: 20 })
    .register({ id: "caption", component: CaptionInspector, order: 30 })
    .register({ id: "transition", component: TransitionInspector, order: 40 })
    .register({ id: "audio", component: AudioInspector, order: 90 })
    .register({ id: "project", component: ProjectInspector, order: 100 });
}
import AudioInspector from "./panels/AudioInspector";
