const axios = require("axios");


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
const createdIds =  {
    "ORDERS/S4H210/ORDERS05": "6dbd9ae1-2eac-467c-8d96-c64642264d07",
    "PORDCR/S4H210/PORDCR05": "e2ca4497-b8b8-4fc4-89bd-1b0211a9f8bd",
    "ZMT_EMPLOYEE/S4H210/ZIT_EMPLOYEE": "f0369e5f-d5dc-48a9-8ae9-0b9372f6886a",
    "CREFET/S4H210/ALEREQ01": "d2bbf385-c17b-4936-840d-d1542604462c",
    "MATFET/S4H210/ALEREQ01": "9ecf5f87-04cf-41d2-be81-a1746225b9e6",
    "DEBFET/S4H210/ALEREQ01": "0659cc17-27f8-4a5a-b0c1-e8d98e60075c",
    "MATMAS/S4H210/MATMAS05": "9796b9e3-18e8-45db-a05e-704133667fb1",
    "MATMAS/S4H210/MATMAS04": "9c18aabd-3758-405d-be59-b9d7a27144f4",
    "MATMAS/S4H210/MATMAS07": "cc64e868-1c55-4e71-ac02-5b011beb55ea",
    "DEBMAS/S4H210/DEBMAS08": "33daac31-3da4-472b-bb30-da2dfecd633c",
    "DEBMAS/S4H210/DEBMAS04": "48682d96-5fdf-4e87-8148-f061ea12c8a6",
    "CREMAS/S4H210/CREMAS02": "b18b8eb1-5407-4e59-b4f8-447654865c5d",
    "CREMAS/S4H210/CREMAS05": "0942806a-3571-4594-98f2-3c92a5a1e9aa",
    "CREMAS/S4H210/CREMAS07": "b39cdb16-c85d-4b77-bf1c-909468210c06",
    "ORDRSP/S4H210/ORDERS05": "6b0b5e8d-22b3-424c-827b-b09ae92102f4"
  }

const BEARER_TOKEN = "eyJ0eXAiOiJKV1QiLCJqaWQiOiJwekJxT2V4UGJjSVJTUTFZdDBFbVVINnFQRm5kKzEwYUhUS0xhajd0THpVPSIsImFsZyI6IlJTMjU2Iiwiamt1IjoiaHR0cHM6Ly9pbmMtY3VzdC1wb2MuYXV0aGVudGljYXRpb24uZXUxMC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoiZGVmYXVsdC1qd3Qta2V5LTdmZjdkMDQ3NmEifQ.eyJzdWIiOiJzYi1aVFJFX0JhY2tlbmRfMS1pbmMtY3VzdC1wb2MtSW50ZWdyYXRpb24tQWNjZWxlcmF0b3IhdDM3OTU4MCIsImlzcyI6Imh0dHBzOi8vaW5jLWN1c3QtcG9jLmF1dGhlbnRpY2F0aW9uLmV1MTAuaGFuYS5vbmRlbWFuZC5jb20vb2F1dGgvdG9rZW4iLCJhdXRob3JpdGllcyI6WyJ1YWEucmVzb3VyY2UiXSwiY2xpZW50X2lkIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJhdWQiOlsic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJ1YWEiXSwiZXh0X2F0dHIiOnsiZW5oYW5jZXIiOiJYU1VBQSIsInN1YmFjY291bnRpZCI6IjBjODY0MTY3LWYyMGQtNDgzOC05YzhiLTk4M2VjNDA2MjY2YiIsInpkbiI6ImluYy1jdXN0LXBvYyJ9LCJ6aWQiOiIwYzg2NDE2Ny1mMjBkLTQ4MzgtOWM4Yi05ODNlYzQwNjI2NmIiLCJncmFudF90eXBlIjoiY2xpZW50X2NyZWRlbnRpYWxzIiwiYXpwIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAiLCJzY29wZSI6WyJ1YWEucmVzb3VyY2UiXSwiZXhwIjoxNzgxNzE4OTQ2LCJpYXQiOjE3ODE2NzU3NDYsImp0aSI6IjU0NDljZTM3ZTYyYjRiZjA4MjEzM2MyZTUwNGIzOGVkIiwicmV2X3NpZyI6IjliM2NhMWY0IiwiY2lkIjoic2ItWlRSRV9CYWNrZW5kXzEtaW5jLWN1c3QtcG9jLUludGVncmF0aW9uLUFjY2VsZXJhdG9yIXQzNzk1ODAifQ.FPe47wgklA_UE0-uX3z_SzovL1OyPUaMk4EZWSwB7f6aI_YdB4-sPQ4Ctjh-Orw10Hw8O3oznZX2xyNHvwyVAXE0Zojk8zZB9-HBItkFqRygKG87dGeXfWSYdw-1TqQwcJ8O-6MSj_9unpdp6blgDHbij5Z5Z4FaqlRu6IpHGbW3Nas5UPrBiMQAghnSQkYWvEVeXVAdpsv7xUv1kWJmJKeDhWdS5rOulEsdU_pWXGESUYtkkCNpJNDHAjW1afHQ4Vs7KmVEb4c0tVpzeke211vf3AG5Lr0rX0G5NuK56BMyKpyMICe_9ci6rwuzltAFlddy70eazwS2vfaZiM2x-w"
const BASE_URL = "https://inc-cust-poc-integration-accelerator-ztre-backend-1-srv.cfapps.eu10-004.hana.ondemand.com/service/zTR_Backend_1";

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
    for (const id of Object.values(createdIds)) {
        await callApi(id);
    }
}

main();