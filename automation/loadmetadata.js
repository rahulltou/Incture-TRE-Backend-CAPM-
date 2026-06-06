const axios = require("axios");

const BEARER_TOKEN = "eyJ0eXAiOiJKV1QiLCJqaWQiOiJ2NlpzNTRPbEE3MHZSRWIrUFFEZ2tiMUtjOVZXd21RbjJjWDd3R2pGU2tjPSIsImFsZyI6IlJTMjU2Iiwiamt1IjoiaHR0cHM6Ly9pbmMtY3VzdC1wb2MuYXV0aGVudGljYXRpb24uZXUxMC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoiZGVmYXVsdC1qd3Qta2V5LTdmZjdkMDQ3NmEifQ.eyJzdWIiOiJzYi1aVFJFX0JhY2tlbmRfMS1pbmMtY3VzdC1wb2MtSW50ZWdyYXRpb24tQWNjZWxlcmF0b3IhdDM3OTU4MCIsImlzcyI6Imh0dHBzOi8vaW5jLWN1c3QtcG9jLmF1dGhlbnRpY2F0aW9uLmV1MTAuaGFuYS5vbmRlbWFuZC5jb20vb2F1dGgvdG9rZW4iLCJhdXRob3JpdGllcyI6WyJ1YWEucmVzb3VyY2UiXSwiY2xpZW50X2lkIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJhdWQiOlsic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJ1YWEiXSwiZXh0X2F0dHIiOnsiZW5oYW5jZXIiOiJYU1VBQSIsInN1YmFjY291bnRpZCI6IjBjODY0MTY3LWYyMGQtNDgzOC05YzhiLTk4M2VjNDA2MjY2YiIsInpkbiI6ImluYy1jdXN0LXBvYyJ9LCJ6aWQiOiIwYzg2NDE2Ny1mMjBkLTQ4MzgtOWM4Yi05ODNlYzQwNjI2NmIiLCJncmFudF90eXBlIjoiY2xpZW50X2NyZWRlbnRpYWxzIiwiYXpwIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJzY29wZSI6WyJ1YWEucmVzb3VyY2UiXSwiZXhwIjoxNzgwNzcxMzYxLCJpYXQiOjE3ODA3MjgxNjEsImp0aSI6IjlkNDRjZTVkYzg2ZTQxYTRhMTNiZjc0M2MwNjU3OWE4IiwicmV2X3NpZyI6IjliM2NhMWY0IiwiY2lkIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAifQ.JgrqWVn9Ufn14yLQZvUy1Om7790R-FcU9l4CdcVRBsxq4LAuKO3Sl-XdnoTTHvmS9Mi124vp42rwP-16rM171IdpNxq3-O3g0RAKYq-qp6Rbd697yelX8-4AKC6F9KBu54FcXsgS0ma8re9awg7SLXJD6-vBiPWgtmAp2x9wVtu6tWEl2zrcZmy5kIqam3Xg6BJSYqwg_q3QU_iIYWWDzc0hOE89IkqSAvsyYCJT5y5lhmudhBCu1BakGsQVyLkyFVL1G_HD0RB0IFkepD0r-caeA0gGzZ5Hnt3Rm7oQmnNS9IBEKN062-NLGZe3kCt3xNyi2LT24pGxyA5O4swlZg";

const ids = [
    "a7d94f8e-62b3-4f15-b8e1-7c3a5d9f2e64",
    "c8f1e0d2-7a54-4c91-a4f5-9b2e6d8f1a73",
    "5e2d7b3a-1f46-4f8b-9c72-3d9a8e4c6f21",
    "f3b61d92-90ef-4f6d-bf82-5a6d18c74211",
    "4d7f2e1a-c5b9-47e0-8a23-91b7e4d6f820",
    "e2c7f681-14d3-4f88-b72f-38c5e9d2a761",
    "7a5c8e19-d4f2-4c0b-a1e7-6b8d9f3a2450",
    "bc8d41f7-0e53-45a9-8df4-12c6e7b95031",
    "31e8b5c0-9d24-4f7a-a6c3-7f1d2e9b4865",
    "d7f9c281-6b43-4de5-9a02-58f3e1c7b964",
    "8f42d7c5-e6a1-4b0c-95d8-21f7e4a963b2",
    "25c9e4b7-81d3-4fa6-9e02-6d8f7b1c5304",
    "fa6b3e90-72c1-4d58-8f23-4c9d1e7b8652",
    "6e1f9c82-54b7-47da-a203-8f4d6b1c7953",
    "9ab2f0c8-3e7d-4a96-8f1a-6e4c7d2b8f51"
];

const BASE_URL =
    "https://inc-cust-poc-integration-accelerator-ztre-backend-1-srv.cfapps.eu10-004.hana.ondemand.com/service/zTR_Backend_1";

async function callApi(id) {
    const url = `${BASE_URL}/MessageTypesForMetadata(ID=${id},IsActiveEntity=true)/tRE_Admin.loadMetadata`;

    try {
        const response = await axios.post(
            url,
            {},
            {
                headers: {
                    Authorization: `Bearer ${BEARER_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("\n========================================");
        console.log(`ID: ${id}`);
        console.log("Status:", response.status);
        console.log("Response:");
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log("\n========================================");
        console.log(`ID: ${id}`);
        console.log("Error Status:", error.response?.status);
        console.log(
            JSON.stringify(error.response?.data || error.message, null, 2)
        );
    }
}

async function main() {
    for (const id of ids) {
        await callApi(id);
    }
}

main();