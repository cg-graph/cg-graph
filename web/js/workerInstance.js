class WorkerClient {
  constructor(workerPath) {
    this.worker = new Worker(workerPath, {type: "module"});
    this.pendingTasks = new Map(); // id -> resolve/reject functions

    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      if (this.pendingTasks.has(id)) {
        const { resolve, reject } = this.pendingTasks.get(id);
        if (error) reject(error);
        else resolve(result);
        console.log("Deleting task", id)
        this.pendingTasks.delete(id); // Clean up
      }
    };
  }

  execute(payload) {
    console.log("In execute with payload", payload);
    const id = crypto.randomUUID(); // Or a simple counter
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(id, { resolve, reject });
      console.log("In promise!")
      this.worker.postMessage({ id, payload });
    });
  }
}


// workerInstance.js
const statsWorker =  new WorkerClient("./js/statsWorker.js") //new Worker("js/statsWorker.js", { type: 'module' });

// // You can add shared logic here
// statsWorker.onerror = (err) => console.error("Worker Error:", err);

export default statsWorker;

