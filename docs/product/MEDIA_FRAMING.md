# Persistent Media Framing

Canonical framing for images and videos inside the 9:16 frame.

## Flow

```text
Media Inspector / direct manipulation
        ↓
StoryDocument media patch (intent: "media")
        ↓
canonical framing values
        ↓
resolveSceneMediaFraming()
       ↙                     ↘
Preview adapter          Export adapter
```

## Storage (compatibility)

| Media | Write authority | Also synced |
|-------|-----------------|-------------|
| Image | `scene.image.{fitMode,x,y,scale,rotation}` | `scene.media.{fitMode,transform}` |
| Video | `scene.media.{fitMode,transform}` | — |

Fit mapping: `fill` ↔ `cover`, `fit` ↔ `contain`.

Pan/zoom are stored in **reference-frame units** (`1080×1920`), not viewport pixels.

## Local drag vs persisted state

During drag: `persisted framing + temporary screen delta` → live preview.  
On `pointerup` / `pointercancel` / `lostpointercapture`: one `buildMediaFramingPatch` / `applyMediaFramingSettings` commit, then clear delta.

## Composition

```text
Fit/fill + persistent pan/zoom/rotation
+ Shared media motion (scene.media.motion)
+ Scene transition (outer layer)
```

Framing is **not** written into `scene.media.motion`.

## Media replace policy

Replacing the media source (upload/replace) **resets** framing to defaults unless an intentional preserve path is added later.

## Module

`src/features/media-framing/`
