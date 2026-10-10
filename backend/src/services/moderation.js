import OpenAI from 'openai';

// Twist #1: blind AI moderation. Runs BEFORE a payment intent exists, so
// rejected content never gets charged and never needs a human queue.
export function createModeration(apiKey) {
  if (!apiKey) {
    console.warn('[moderation] OPENAI_API_KEY not set: moderation is OFF (dev only).');
    return { enabled: false, check: async () => ({ ok: true }) };
  }

  const openai = new OpenAI({ apiKey });

  return {
    enabled: true,
    async check({ text, imageDataUrl }) {
      // Video frames are checked one by one with no text.
      const input = text ? [{ type: 'text', text }] : [];
      // omni-moderation looks at the actual pixels, not just the URL string.
      if (imageDataUrl) input.push({ type: 'image_url', image_url: { url: imageDataUrl } });

      const res = await openai.moderations.create({ model: 'omni-moderation-latest', input });
      const result = res.results[0];
      if (!result.flagged) return { ok: true };

      const categories = Object.entries(result.categories)
        .filter(([, hit]) => hit)
        .map(([name]) => name);
      return { ok: false, categories };
    },
  };
}
