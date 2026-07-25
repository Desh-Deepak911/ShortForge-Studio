/**
 * Test/reference-only PNG-directory encode surface.
 * Production execution and public worker barrels must not import this module
 * for the live image2pipe path — see encode-png-stream.ts.
 */

export { encodePngSequence } from "../ffmpeg/encode-png-sequence";
export { encodePngSequenceToWebm } from "../ffmpeg/encode-png-sequence-webm";
