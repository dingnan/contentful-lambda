/**
 * Lambda handler tests
 */

const { handler } = require('./index');

// Mock clients
jest.mock('./contentful-client', () => ({
  fetchEntries: jest.fn().mockResolvedValue({
    items: [
      {
        sys: { id: 'entry1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
        fields: { title: { 'en-US': 'Hello World' }, slug: { 'en-US': 'hello-world' } },
      },
    ],
    total: 1,
  }),
}));

jest.mock('./akamai-client', () => ({
  uploadFile: jest.fn().mockResolvedValue({ statusCode: 200 }),
}));

describe('Lambda Handler', () => {
  const mockEvent = {
    headers: { 'x-contentful-webhook-secret': 'test-secret' },
    body: JSON.stringify({
      sys: {
        id: 'entry1',
        contentType: { sys: { id: 'article' } },
        locale: 'en-US',
      },
    }),
  };

  beforeEach(() => {
    process.env.CONTENTFUL_WEBHOOK_SECRET = 'test-secret';
    process.env.CONTENTFUL_SPACE_ID = 'test-space';
    process.env.CONTENTFUL_ACCESS_TOKEN = 'test-token';
    process.env.AKAMAI_HOST = 'test.akamai.com';
    process.env.AKAMAI_CPCODE = '123456';
    process.env.AKAMAI_KEY_NAME = 'test-key';
    process.env.AKAMAI_KEY = 'test-secret-key';
  });

  test('returns 200 on successful sync', async () => {
    const result = await handler(mockEvent);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Content synced successfully');
    expect(body.contentType).toBe('article');
  });

  test('returns 401 with invalid webhook secret', async () => {
    const event = {
      ...mockEvent,
      headers: { 'x-contentful-webhook-secret': 'wrong-secret' },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });
});
