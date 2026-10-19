export type { CommentOptions, CommentStyle } from './lib/comment-style.js';
export type { MalformedReason } from './lib/errors.js';
export type { ManualSectionOptions, MergeResult } from './lib/merge.js';
export type { ManualSection } from './lib/sections.js';
export type { SignOptions, VerifyResult } from './lib/signature.js';
export { commentStyle } from './lib/comment-style.js';
export {
    GeneratedSignatureCommentStyleError,
    GeneratedSignatureError,
    GeneratedSignatureMalformedError,
    GeneratedSignatureSectionIdError,
} from './lib/errors.js';
export { manualSection, mergeSections, parseSections } from './lib/merge.js';
export { sign, signatureToken, verify } from './lib/signature.js';
