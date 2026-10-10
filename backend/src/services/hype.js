// Twist #4: the short-form video hype machine.
// Takeovers worth a video go into the hype_jobs queue; the render worker
// (src/workers/videoWorker.js) picks them up in its own process, so heavy
// rendering never slows down bidding. Only big takeovers are queued, or the
// social accounts turn into spam and get rate-limited.
export function createHypeQueue({ store, minCents }) {
  return {
    async enqueue({ bid, previous }) {
      if (bid.amountCents < minCents) return;
      try {
        await store.enqueueHypeJob({
          bidId: bid.id,
          name: bid.name,
          tagline: bid.tagline,
          imageUrl: bid.imageUrl,
          amountCents: bid.amountCents,
          previousName: previous?.name ?? null,
          previousAmountCents: previous?.amountCents ?? null,
        });
      } catch (err) {
        console.error('[hype] failed to queue video job', err);
      }
    },
  };
}
