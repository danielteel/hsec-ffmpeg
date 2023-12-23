const knexFn = require('knex');


let knex = null;

function getKnex(){
    return knex;
}

//singleton-ish, stores connection in global for use in other files. aka, you can only connect to one database unless I add some more codes
function connect(knexProfile, onConnect, maxAttempts=60, logOut=console.log){
    let localKnex=null;
    let attempt=0;
    
    let resolveFn, rejectFn;
    const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

    async function attemptConnection(){
        if (attempt<=maxAttempts){
            attempt++;
            try {
                localKnex = knexFn(knexProfile);
                await localKnex.raw("SELECT 1");
                if (onConnect){
                    let returned = onConnect(localKnex, attempt);
                    if (Array.isArray(returned) || returned instanceof Promise){
                        if (!Array.isArray(returned)) returned = [returned];
                        Promise.all(returned).then( () => {
                            resolveFn(localKnex);
                        })
                    }
                }else{
                    resolveFn(localKnex);
                }
                knex=localKnex;
            } catch (e) {
                logOut("attempt "+attempt+" failed to connect, trying again in a second");
                setTimeout(attemptConnection, 1000);
            }
        } else {
            rejectFn();
            throw Error("max attempt exceed for connection");
        }
    }

    attemptConnection();

    return promise;
}

function waitForTableToExist(tableName){
    let resolveFn, rejectFn;
    const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

    async function checkIfExists(){
        if (await knex.schema.hasTable(tableName)){
            setTimeout(()=>resolveFn(), 2000);//allow a little time for table to be seeded
        }else{
            setTimeout(checkIfExists, 2000);
        }
    }

    checkIfExists();

    return promise;
}

module.exports = {connect, getKnex, waitForTableToExist};