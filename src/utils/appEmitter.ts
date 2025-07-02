import { EventEmitter } from "events";

// Create and export a single instance to be used throughout the application.
const appEmitter = new EventEmitter();

export default appEmitter;
