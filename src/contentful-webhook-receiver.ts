exports.handler = async (event, context) => {
  console.log('😀Hello World - Contentful webhook received payload:', {event, context});

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '😀 Hello World from Contentful webhook receiver',
    }),
  };
};