const { connect, waitForTableToExist } = require('./database');
const fs = require('node:fs');
const {spawn, execSync} = require('node:child_process');
const express=require('express');
const cors = require('cors');

const knexConfig =  {
    client: 'postgresql',
    connection: {
        host: '127.0.0.1',
        port: 5432,
        database: process.env.DB_DB,
        user:     process.env.DB_USER,
        password: process.env.DB_PASS
    }
};
 

async function main(){
    let knex=null;
    let ffmpegProcess=null;
     
    process.on('SIGTERM', ()=>{
        console.log('SIGTERM recieved, killing ffmpeg child process');
        try{
            execSync('killall ffmpeg', {stdio:'pipe'});
        }catch{}
        process.exit();
    });

    function unexpectedExitFFMPEG(){
        console.log('ffmpeg child process exited');
        startFFMPEG();
    }

    async function startFFMPEG(){
        if (ffmpegProcess) ffmpegProcess.off('exit', unexpectedExitFFMPEG);
        try{
            execSync('killall ffmpeg', {stdio:'pipe'});
        }catch{}
        
        ffmpegProcess=null;

        const formats = await knex('formats').select('*');

        if (formats.length){
            ffmpegProcess=spawnFFMPEG(formats);
            ffmpegProcess.on('exit', unexpectedExitFFMPEG);

            console.log('ffmpeg child process started');
        }else{
            console.log('no formats specified, not starting ffmpeg');
        }
    }

    console.log('starting up...');
    knex = await connect(knexConfig);
    console.log('database connected, waiting for formats table...');
    await waitForTableToExist('formats');
    console.log('formats table exists');

    startFFMPEG();

    //Start express server
    const app=express();
    app.use(cors());
    app.use(express.json());

    app.get('/update/:secret', async (req, res)=>{
        try {
            if (req.params.secret && req.params.secret === process.env.FFMPEG_SECRET) {
                console.log('updating formats');
                setImmediate(startFFMPEG);
            }else{
                console.log('invalid update secret');
            }
        }catch (e){
            console.log('ERROR: /update',e);
        }
        res.status(200).json({status: 'success'});
    });

    app.listen(process.env.FFMPEG_PORT, () => {
        console.log('server listening on', process.env.FFMPEG_PORT);
    });
}

main();



function spawnFFMPEG(formats){
    function buildArgs(w, h, filter, qual, fps, blockSeconds, fileName){
        let addFilter = [];
        if (typeof filter==='string' && filter.trim().length!==0) addFilter=['-filter:v', filter];
        return [
            '-s', String(w)+'x'+String(h),
            '-fflags', 'nobuffer',
            '-pix_fmt', 'yuv420p',
            ...addFilter,
            '-r', String(fps),
            '-g', String(fps*blockSeconds),
            '-c:v', 'libx264',
            '-crf', String(qual),
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-hls_time', String(blockSeconds),
            '-hls_list_size', '2',
            '-hls_flags', 'delete_segments',
            process.env.CAM_DIR+fileName
        ]
    }
    function buildArgsJpg(w, h, filter, qual, fps, fileName){
        let addFilter = [];
        if (typeof filter==='string' && filter.trim().length!==0) addFilter=['-filter:v', filter];
        return [
            '-s', String(w)+'x'+String(h),
            '-fflags', 'nobuffer',
            ...addFilter,
            '-r', String(fps),
            '-qscale', String(qual),
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-y',
            '-update', '1',
            process.env.CAM_DIR+fileName
        ]
    }
    
    try{
        fs.rmSync(process.env.CAM_DIR, {recursive: true, force: true});
    }catch(e){
        console.log('error trying to delete '+process.env.CAM_DIR);
    }

    try {
        fs.mkdirSync(process.env.CAM_DIR);
    }catch (e){        
        if (e.code !== 'EEXIST') {
            console.log('error trying to create '+process.env.CAM_DIR);
        }
    }

    let outputArgs=[];
    for (const format of formats){
        if (format.type==='hls'){
            outputArgs=[...outputArgs, ...buildArgs(format.w, format.h, format.filter, format.qual, format.fps, format.block, format.file)];
        }else if (format.type==='jpg'){
            outputArgs=[...outputArgs, ...buildArgsJpg(format.w, format.h, format.filter, format.qual, format.fps, format.file)];
        }
    }
    const args = [
        '-threads', '3',
        '-i', process.env.FFMPEG_INPUT,
        ...outputArgs,
    ]
    const child = spawn('ffmpeg', args);

    child.stderr.on('data', (data) => null);
    child.stdout.on('data', (data) => null);

    return child;
} 