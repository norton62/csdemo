// A simple script to test the local API server.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var API_BASE_URL = 'http://localhost:3000';
// --- Test Data ---
var sampleShareCode = 'CSGO-aE435-4hOZy-iUaKz-toweY-NGXbD';
var sampleCsStatsUrl = 'https://csstats.gg/match/307887418/watch/6c0894efc13838898460bb7a30f9c6301a93f1e670e2c22eb552ea72da3759da';
// --- Helper Function to Make Requests ---
function testEndpoint(name_1, path_1) {
    return __awaiter(this, arguments, void 0, function (name, path, options) {
        var response, responseData, error_1;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\n--- Testing: ".concat(name, " ---"));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("".concat(API_BASE_URL).concat(path), options)];
                case 2:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 3:
                    responseData = _a.sent();
                    console.log("Status: ".concat(response.status));
                    console.log('Response Body:');
                    console.log(responseData);
                    if (!response.ok) {
                        console.log('--- TEST FAILED ---');
                    }
                    else {
                        console.log('--- TEST PASSED ---');
                    }
                    return [2 /*return*/, responseData];
                case 4:
                    error_1 = _a.sent();
                    console.error('Request failed with error:', error_1);
                    console.log('--- TEST FAILED ---');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// --- Main Test Runner ---
function runTests() {
    return __awaiter(this, void 0, void 0, function () {
        var decodeResponse, downloadUrl, response, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Starting API tests...');
                    // Test 1: Get the current count
                    return [4 /*yield*/, testEndpoint('Get Count', '/count')];
                case 1:
                    // Test 1: Get the current count
                    _a.sent();
                    return [4 /*yield*/, testEndpoint('Decode Share Code', '/decode', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ shareCode: sampleShareCode }),
                        })];
                case 2:
                    decodeResponse = _a.sent();
                    if (!(decodeResponse && decodeResponse.downloadLink)) return [3 /*break*/, 6];
                    // We just check if the endpoint exists and returns a success status, not the full download
                    console.log('\n--- Testing: Download Proxy ---');
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    downloadUrl = "/download?url=".concat(encodeURIComponent(decodeResponse.downloadLink));
                    return [4 /*yield*/, fetch("".concat(API_BASE_URL).concat(downloadUrl), { method: 'HEAD' })];
                case 4:
                    response = _a.sent();
                    console.log("Status: ".concat(response.status));
                    if (response.ok && response.headers.get('content-disposition')) {
                        console.log('Content-Disposition header is present.');
                        console.log('--- TEST PASSED ---');
                    }
                    else {
                        console.log('Response was not a valid file stream.');
                        console.log('--- TEST FAILED ---');
                    }
                    return [3 /*break*/, 6];
                case 5:
                    error_2 = _a.sent();
                    console.error('Download proxy test failed:', error_2);
                    console.log('--- TEST FAILED ---');
                    return [3 /*break*/, 6];
                case 6: 
                // Test 4: Resolve a CSstats.gg link
                return [4 /*yield*/, testEndpoint('Resolve CSstats.gg Link', '/decode', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ shareCode: sampleCsStatsUrl }),
                    })];
                case 7:
                    // Test 4: Resolve a CSstats.gg link
                    _a.sent();
                    console.log('\nAll tests complete.');
                    return [2 /*return*/];
            }
        });
    });
}
// Run the tests
runTests();
