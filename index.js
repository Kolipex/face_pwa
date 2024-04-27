const human = new Human.Human();
const video = document.querySelector('video');
const result = document.querySelector('canvas');

const deConf = {
    body: {enabled:false},
    hand: {enabled:false},
    face: {
        iris:{enabled:false},
        emotion:{enabled:false}
    }
}

async function getMedia() {
    try {
        let stream = await window.navigator.mediaDevices.getUserMedia({video:true, sound:false});
        video.srcObject = stream;
        human.video(video, deConf);
    } catch (err) {}
};

async function faceCheck(){
    let res = human.next();
    console.log(res);
    human.draw.face(result, res, {});
}