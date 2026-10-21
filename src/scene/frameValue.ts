/** Read animation progress at frame time without subscribing the React tree to every frame. */
export type FrameValue = number | (() => number);
export function readFrameValue(value: FrameValue) { return typeof value === 'function' ? value() : value; }
