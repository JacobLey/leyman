import { createPostsLoader, type Post } from '../blog.js';

declare const data: readonly Post[];
export { data };

export default createPostsLoader();
