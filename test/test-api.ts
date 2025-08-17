// A simple script to test the local API server.

const API_BASE_URL = 'http://localhost:3000';

// --- Test Data ---
const sampleShareCode = 'CSGO-aE435-4hOZy-iUaKz-toweY-NGXbD';
const sampleCsStatsUrl = 'https://csstats.gg/match/307887418/watch/6c0894efc13838898460bb7a30f9c6301a93f1e670e2c22eb552ea72da3759da';

// --- Helper Function to Make Requests ---
async function testEndpoint(name: string, path: string, options: RequestInit = {}) {
    console.log(`\n--- Testing: ${name} ---`);
    try {
        const response = await fetch(`${API_BASE_URL}${path}`, options);
        
        // For non-JSON responses, just check the status
        if (!response.headers.get('content-type')?.includes('application/json')) {
            console.log(`Status: ${response.status}`);
            if (response.ok) {
                console.log('--- TEST PASSED ---');
            } else {
                console.log('--- TEST FAILED ---');
            }
            return { ok: response.ok, status: response.status };
        }
        
        const responseData = await response.json();

        console.log(`Status: ${response.status}`);
        console.log('Response Body:');
        console.log(responseData);

        if (!response.ok) {
            console.log('--- TEST FAILED ---');
        } else {
            console.log('--- TEST PASSED ---');
        }
        return responseData;
    } catch (error) {
        console.error('Request failed with error:', error);
        console.log('--- TEST FAILED ---');
    }
}

// --- Main Test Runner ---
async function runTests() {
    console.log('Starting API tests...');

    // Test 1: Get the current count
    await testEndpoint('Get Count', '/count');

    // Test 2: Decode a standard share code
    const decodeResponse = await testEndpoint('Decode Share Code', '/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareCode: sampleShareCode }),
    });

    // Test 3: Use the download proxy with the link from the previous test
    if (decodeResponse && decodeResponse.downloadLink) {
        const downloadUrl = `/download?url=${encodeURIComponent(decodeResponse.downloadLink)}`;
        await testEndpoint('Download Proxy (HEAD request)', downloadUrl, { method: 'HEAD' });
    }

    // Test 4: Resolve a CSstats.gg link
    await testEndpoint('Resolve CSstats.gg Link', '/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareCode: sampleCsStatsUrl }),
    });

    console.log('\nAll tests complete.');
}

// Run the tests
runTests();
