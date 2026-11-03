/**
 * A client mistake that must surface as JSON-RPC -32602 Invalid params.
 *
 * Without this, every thrown error in the dispatcher became -32603 Internal
 * error, so a missing argument looked like a server fault — and MCP clients
 * respond to that by retrying or aborting rather than correcting the call.
 */
export class InvalidParamsError extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidParamsError";
        this.code = -32602;
    }
}
