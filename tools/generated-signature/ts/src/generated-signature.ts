export type { CommentOptions, CommentStyle } from './lib/comment-style.js';
export type { MalformedReason } from './lib/errors.js';
export type { Manifest, ManifestEntry, ManifestInputs } from './lib/manifest.js';
export type { ManualSectionOptions, MergeResult } from './lib/merge.js';
export type { ManualSection } from './lib/sections.js';
export type { SignOptions, VerifyResult } from './lib/signature.js';
export { commentStyle } from './lib/comment-style.js';
export {
    GeneratedSignatureCommentStyleError,
    GeneratedSignatureError,
    GeneratedSignatureMalformedError,
    GeneratedSignatureManifestError,
    GeneratedSignatureSectionIdError,
} from './lib/errors.js';
export {
    contentHash,
    parseManifest,
    serializeManifest,
    verifyManifestEntry,
} from './lib/manifest.js';
export { manualSection, mergeSections, parseSections } from './lib/merge.js';
export { sign, signatureToken, verify } from './lib/signature.js';
