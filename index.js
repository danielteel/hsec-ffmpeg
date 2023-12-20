const { connect } = require('./database');
const fs = require('node:fs');
const {spawn, exec} = require('node:child_process');

//process.env.FFMPEG_SECRET

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
        if (ffmpegProcess){
            //Hopefully one of these things works at killing it
            ffmpegProcess.stdin.write('q');
            ffmpegProcess.stdin.end();
            ffmpegProcess.kill();
            exec('kill -9 '+ffmpegProcess.pid);
        }
    });

    function startFFMPEG(){
        //read ffmpeg details from db
        const formats = [
            {type: 'jpg', file: 'il.jpg', title:'I-Lo', w: 640, h:360, qual: 13, fps: 0.66},///10 kbps
            {type: 'jpg', file: 'ih.jpg', title:'I-Hi', w: 1280, h:720, qual: 13, fps: 0.66},//33 kbps
            {type: 'hls', file: 'hqll.m3u8', title:'V-Lo', w: 640, h: 360, qual: 24, fps: 4, block: 2},//50 kbps
            {type: 'hls', file: 'best.m3u8', title:'V-Hi', w: 1280, h: 720, qual: 24, fps: 4, block: 2},//188 kbps
        ];


        ffmpegProcess=spawnFFMPEG(formats);
        console.log('ffmpeg child process started');
    
        ffmpegProcess.on('exit', (code) => {
            console.log('ffmpeg child process exited');
            setTimeout(startFFMPEG, 2000);
        });
    }

    console.log('starting up...');

    knex = await connect(knexConfig);
    console.log('database connected');

    startFFMPEG();
}

main();


function spawnFFMPEG(formats){
    function buildArgs(w, h, qual, fps, blockSeconds, fileName){
        return [
            '-s', String(w)+'x'+String(h),
            '-vf', 'format=yuv420p',
            '-r', String(fps),
            '-g', String(fps*blockSeconds),
            '-c:v', 'libx264',
            '-crf', String(qual),
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-hls_time', String(blockSeconds),
            '-hls_list_size', '2',
            '-hls_flags', 'delete_segments',
            process.env.CAM_DIR+fileName
        ]
    }
    function buildArgsJpg(w, h, qual, fps, fileName){
        return [
            '-s', String(w)+'x'+String(h),
            '-r', String(fps),
            '-qscale', String(qual),
            '-preset', 'veryfast',
            '-tune', 'zerolatency',
            '-y',
            '-update', '1',
            process.env.CAM_DIR+fileName
        ]
    }
    
    try{
        fs.rmSync(process.env.CAM_DIR, {recursive: true, force: true, maxRetries: 10, retryDelay: 500});
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
            outputArgs=[...outputArgs, ...buildArgs(format.w, format.h, format.qual, format.fps, format.block, format.file)];
        }else if (format.type==='jpg'){
            outputArgs=[...outputArgs, ...buildArgsJpg(format.w, format.h, format.qual, format.fps, format.file)];
        }
    }
    const args = [
        '-i', process.env.FFMPEG_INPUT,
        ...outputArgs,
    ]
    const child = spawn('ffmpeg', args, {detached: true});

    child.stderr.on('data', (data) => console.log(data.toString()));
    child.stdout.on('data', (data) => null);

    return child;
}