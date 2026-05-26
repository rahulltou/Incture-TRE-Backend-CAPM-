
const axios = require('axios');

const cpiUser = 'sb-ed386d9e-a332-4d22-b26e-6ac05814ea1d!b63626|it-rt-inccpidev!b16077';
        const cpiPwd = 'f9677ae8-b1e2-4e09-bb2e-0f22d14236ee$FDsyqDwD8BHfW5r2yZX-SU4_ijoeOxwTSVn7eq4YCB4=';
        const cpiEndpoint = 'https://inccpidev.it-cpi001-rt.cfapps.eu10.hana.ondemand.com/http/transactionReprocessing';

// await axios.post(cpiEndpoint, "cpiPayload", {
//     headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Basic ${Buffer.from(`${cpiUser}:${cpiPwd}`).toString('base64')}`
//     },
//     timeout: 60000
// });


// test.js

// const axios = require('axios');

async function triggerCPI() {
    try {
        // CPI Credentials
        const cpiUser = 'sb-ed386d9e-a332-4d22-b26e-6ac05814ea1d!b63626|it-rt-inccpidev!b16077';
        const cpiPwd = 'f9677ae8-b1e2-4e09-bb2e-0f22d14236ee$FDsyqDwD8BHfW5r2yZX-SU4_ijoeOxwTSVn7eq4YCB4=';
        const cpiEndpoint = 'https://inccpidev.it-cpi001-rt.cfapps.eu10.hana.ondemand.com/http/transactionReprocessing';

        // CPI Endpoint
        // const cpiEndpoint =
        //     'https://inccpidev.it-cpi001-rt.cfapps.eu10.hana.ondemand.com/http/transactionReprocessing';

        // Payload
        const cpiPayload = {
            attemptId: '550e8400-e29b-41d4-a716-446655440000',
            idocStatus: 'SUCCESS',
            reprocessMessage: 'IDoc reprocessed successfully'
        };

        // API Call
        const response = await axios.post(
            cpiEndpoint,
            cpiPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization:
                        `Basic ${Buffer.from(
                            `${cpiUser}:${cpiPwd}`
                        ).toString('base64')}`
                },
                timeout: 60000
            }
        );

        console.log('Status:', response.status);
        console.log('Response:', response.data);

    } catch (error) {

        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Response:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }

    }
}

triggerCPI();