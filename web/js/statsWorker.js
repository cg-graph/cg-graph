// statsWorker.js
import { statistics } from './statistics.js';

const statsEngine = new statistics();

onmessage = function(e) {
    
    const { id, payload } = e.data; 
    
    try {
        const msgType = payload.type;
        const data = payload.data;
        let response = "";

        if (msgType === "newGraph") {
            response = statsEngine.update(data);
        } else if (msgType === "node") {
            console.log("GOT MESSAGE", data)
            response = statsEngine.getNodeData(data);
        }
        else if (msgType === "edge"){
            
        }

        // 3. IMPORTANT: Send back the ID along with the result
        // This allows WorkerClient to find the correct Promise to resolve
        postMessage({ id, result: response });

    } catch (err) {
        // 4. Send back the ID even on error so the Promise can reject
        postMessage({ id, error: err.message });
        console.error("Worker internal error:", err);
    }
};
