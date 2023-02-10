const validator = require('../src/R.js')
const events = require('events');

const eventEmitter = new events.EventEmitter();
eventEmitter.on("progress", d => {
    console.log("Function Progress: ", d)
})

const test = async () => {
    const r = await validator.callMethodAsync("./RScripts/test_progress.R", "slow_sum", [10], eventEmitter)
}
test();