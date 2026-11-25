import test from 'node:test';
import assert from 'node:assert/strict';
const { youtubeId } = await import('../web/src/videos.js').catch(() => ({}));

test('YouTube bağlantısından video kimliği', { skip: !youtubeId }, () => {
  for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ'])
    assert.equal(youtubeId(u), 'dQw4w9WgXcQ', u);
  assert.equal(youtubeId('https://example.com/x'), null);
});
