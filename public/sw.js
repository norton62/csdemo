// Service Worker for handling mixed-content downloads

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if the request is for our special download path
  if (url.pathname === '/download-demo') {
    const demoUrl = url.searchParams.get('url');

    if (demoUrl) {
      console.log('Service Worker intercepting download for:', demoUrl);
      // Respond with a promise that fetches the demo file
      event.respondWith(
        fetch(demoUrl, {
          // Important: 'no-cors' mode is needed for mixed-content requests
          mode: 'no-cors', 
        })
        .then(response => {
          // Create new headers for the response to the browser
          const headers = new Headers({
            'Content-Type': 'application/octet-stream',
            // Suggest a filename for the download
            'Content-Disposition': `attachment; filename="${demoUrl.split('/').pop()}"`,
          });
          
          // Return a new Response object that streams the file to the user
          return new Response(response.body, { headers });
        })
        .catch(error => {
          console.error('Service Worker fetch failed:', error);
          // If fetching fails, return an error response
          return new Response('Download failed.', { status: 500 });
        })
      );
    }
  }
});
