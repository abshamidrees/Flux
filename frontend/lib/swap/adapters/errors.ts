// lib/swap/adapters/errors.ts
// Lets an adapter's quote() throw with a specific, honest reason the aggregator
// surfaces verbatim on the route row — instead of every thrown error collapsing
// into the generic "Quote failed". Used for real, known conditions (no wallet
// connected, no pool at this fee tier), never as a substitute for a real quote.

export class RouteQuoteError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "RouteQuoteError";
  }
}
