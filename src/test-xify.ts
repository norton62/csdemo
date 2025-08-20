// A simple script to test the xify.pro API endpoint.

const API_URL = 'https://api.xify.pro/api/demo/extract';

// --- Test Data ---
const sampleShareCode = 'CSGO-aE435-4hOZy-iUaKz-toweY-NGXbD';

// --- Helper Function to Make Requests ---
async function testXifyEndpoint() {
    console.log(`\n--- Testing: xify.pro API endpoint ---`);
    try {
        // The xify.pro API expects a JSON payload.
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ shareCode: sampleShareCode }),
        });

        console.log(`Status: ${response.status}`);

        if (!response.ok) {
            console.log('Response Body (Error):');
            console.log(await response.text());
            console.log('--- TEST FAILED ---');
            return;
        }

        // The response is JSON, so we parse it.
        const data = await response.json();

        // Check if the response contains the expected download URL.
        if (data && data.downloadUrl && data.downloadUrl.includes('.dem.bz2')) {
            console.log('Found Download URL in JSON response:');
            console.log(data.downloadUrl);
            console.log('--- TEST PASSED ---');
        } else {
            console.log('Could not find a valid downloadUrl in the JSON response.');
            console.log('Response Body:');
            console.log(data);
            console.log('--- TEST FAILED ---');
        }

    } catch (error) {
        console.error('Request failed with error:', error);
        console.log('--- TEST FAILED ---');
    }
}

// --- Main Test Runner ---
async function runTests() {
    console.log(`Starting tests for ${API_URL}...`);
    await testXifyEndpoint();
    console.log('\nAll tests complete.');
}

// Run the tests
runTests();
