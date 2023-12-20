console.log(process.env.FFMPEG_SECRET);


function doCamProcess(){
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
            '/mnt/ramdisk/cam/'+fileName
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
            '/mnt/ramdisk/cam/'+fileName
        ]
    }
    try {
        mkdirSync('/mnt/ramdisk/cam');
    }catch (e){        
        if (e.code !== 'EEXIST') {
            console.log(e);
            process.exit(-1);
        }
    }
    updateScreen('ffmpeg','dir', true);
    
    const formats = [
        {file: 'il.jpg', title:'I-Lo', w: 640, h:360, qual: 13, fps: 0.66},///10 kbps
        {file: 'ih.jpg', title:'I-Hi', w: 1280, h:720, qual: 13, fps: 0.66},//33 kbps
        {file: 'hqll.m3u8', title:'V-Lo', w: 640, h: 360, qual: 24, fps: 4, block: 2},//50 kbps
        {file: 'best.m3u8', title:'V-Hi', w: 1280, h: 720, qual: 24, fps: 4, block: 2},//188 kbps
    ];
    writeFileSync('/mnt/ramdisk/cam/details.json', JSON.stringify(formats));

    let outputArgs=[];
    for (const format of formats){
        if (format.block){
            outputArgs=[...outputArgs, ...buildArgs(format.w, format.h, format.qual, format.fps, format.block, format.file)];
        }else{
            outputArgs=[...outputArgs, ...buildArgsJpg(format.w, format.h, format.qual, format.fps, format.file)];
        }
    }
    const args = [
        '-i', '/dev/video0',
        ...outputArgs,
    ]
    const child = spawn('ffmpeg', args);

    updateScreen('ffmpeg','active', true);
    
    child.on('exit', (code) => {
        updateScreen('ffmpeg','active', false);
    });
    child.stderr.on('data', (data) => null);
    child.stdout.on('data', (data) => null);
}