/**
 * Human demo for browsers
 * @default Human Library
 * @summary <https://github.com/vladmandic/human>
 * @author <https://github.com/vladmandic>
 * @copyright <https://github.com/vladmandic>
 * @license MIT
 */

const H = Human;
const database = "human"
const table = "person"
let db = null;

indexDb = {

  async open() {
    if (db) return true;
    return new Promise(resolve => {
      const request = indexedDB.open(database, 1);

      request.onerror = evt => log("error:", evt);
      request.onupgradeneeded = evt => {
        // create if doesnt exist
        log("create:", evt.target);
        db = evt.target.result;
        db.createObjectStore(table, { keyPath: "id", autoIncrement: true });
      };

      request.onsuccess = evt => {
        // open
        db = evt.target.result;
        log("open:", db);
        resolve(true);
      };
    })
  }

  , async load() {
    const faceDB = [];
    if (!db) await this.open(); // open or create if not already done
    return new Promise(resolve => {
      const cursor = db.transaction([table], "readwrite").objectStore(table).openCursor(null, "next");

      cursor.onerror = evt => log("load error:", evt);
      cursor.onsuccess = evt => {
        if (evt.target.result) {
          faceDB.push(evt.target.result.value);
          evt.target.result.continue();
        } else {
          resolve(faceDB);
        }
      };
    })
  }

  , async count() {
    if (!db) await this.open(); // open or create if not already done
    return new Promise(resolve => {
      const store = db.transaction([table], "readwrite").objectStore(table).count();
      store.onerror = evt => log("count error:", evt);
      store.onsuccess = () => resolve(store.result);
    });
  }

  , async save(faceRecord) {
    if (!db) await this.open(); // open or create if not already done
    const newRecord = {
      name: faceRecord.name,
      descriptor: faceRecord.descriptor,
      image: faceRecord.image,
      dt: faceRecord.dt
    } // omit id as its autoincrement
    db.transaction([table], "readwrite").objectStore(table).put(newRecord);
    log("save:", newRecord);
  }

  ,
  async remove(faceRecord) {
    if (!db) await this.open(); // open or create if not already done
    db.transaction([table], "readwrite").objectStore(table).delete(faceRecord.id); // delete based on id
    log("delete:", faceRecord);
  }

};

const humanConfig = {
  // user configuration for human, used to fine-tune behavior
  cacheSensitivity: 0,
  modelBasePath: "../../models",
  filter: { enabled: true, equalization: true }, // lets run with histogram equilizer
  debug: true,
  face: {
    enabled: true,
    detector: { rotation: true, return: true, mask: false }, // return tensor is used to get detected face image
    description: { enabled: true }, // default model for face descriptor extraction is faceres
    // mobilefacenet: { enabled: true, modelPath: 'https://vladmandic.github.io/human-models/models/mobilefacenet.json' }, // alternative model
    // insightface: { enabled: true, modelPath: 'https://vladmandic.github.io/insightface/models/insightface-mobilenet-swish.json' }, // alternative model
    iris: { enabled: true }, // needed to determine gaze direction
    emotion: { enabled: false }, // not needed
    antispoof: { enabled: true }, // enable optional antispoof module
    liveness: { enabled: true } // enable optional liveness module
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: true } // parses face and iris gestures
}

// const matchOptions = { order: 2, multiplier: 1000, min: 0.0, max: 1.0 }; // for embedding model
const matchOptions = { order: 2, multiplier: 25, min: 0.2, max: 0.8 }; // for faceres model

const options = {
  minConfidence: 0.6, // overal face confidence for box, face, gender, real, live
  minSize: 224, // min input to face descriptor model before degradation
  maxTime: 30000, // max time before giving up
  blinkMin: 10, // minimum duration of a valid blink
  blinkMax: 800, // maximum duration of a valid blink
  threshold: 0.5, // minimum similarity
  distanceMin: 0.4, // closest that face is allowed to be to the cammera in cm
  distanceMax: 1.0, // farthest that face is allowed to be to the cammera in cm
  mask: humanConfig.face.detector.mask,
  rotation: humanConfig.face.detector.rotation,
  ...matchOptions
};

const ok = {
  // must meet all rules
  faceCount: { status: false, val: 0 },
  faceConfidence: { status: false, val: 0 },
  facingCenter: { status: false, val: 0 },
  faceSize: { status: false, val: 0 },
  antispoofCheck: { status: false, val: 0 },
  livenessCheck: { status: false, val: 0 },
  distance: { status: false, val: 0 },
  timeout: { status: true, val: 0 },
  descriptor: { status: false, val: 0 },
  elapsedMs: { status: undefined, val: 0 }, // total time while waiting for valid face
  detectFPS: { status: undefined, val: 0 }, // mark detection fps performance
  drawFPS: { status: undefined, val: 0 } // mark redraw fps performance
};

const allOk = () =>
  ok.elapsedMs.val > 2000 &&
  ok.faceCount.status &&
  ok.faceSize.status &&
  ok.facingCenter.status &&
  ok.faceConfidence.status &&
  ok.antispoofCheck.status &&
  ok.livenessCheck.status &&
  //ok.distance.status &&
  ok.descriptor.status;

const current = { face: null, record: null }; // current face record and matched database record

const blink = {
  // internal timers for blink start/end/duration
  start: 0,
  end: 0,
  time: 0
};

// let db: Array<{ name: string, source: string, embedding: number[] }> = []; // holds loaded face descriptor database
const human = new H.Human(humanConfig); // create instance of human with overrides from user configuration

human.env.perfadd = false; // is performance data showing instant or total values
human.draw.options.font = 'small-caps 18px "Lato"'; // set font used to draw labels when using draw methods
human.draw.options.lineHeight = 20;
human.draw.options.drawLabels = false;

const dom = {
  // grab instances of dom objects so we dont have to look them up later
  video: document.getElementById("video"),
  canvas: document.getElementById("canvas"),
  log: document.getElementById("log"),
  fps: document.getElementById("fps"),
  match: document.getElementById("match"),
  best: document.getElementById("best-match"),
  name: document.getElementById("name"),
  save: document.getElementById("save"),
  delete: document.getElementById("delete"),
  retry: document.getElementById("retry"),
  source: document.getElementById("source"),
  ok: document.getElementById("ok"),
  db: document.getElementById("db")
};
const timestamp = { detect: 0, draw: 0 }; // holds information used to calculate performance and possible memory leaks
let startTime = 0;

const log = (...msg) => {
  // helper method to output messages
  //dom.log.innerText += msg.join(" ") + "\n"
  //console.log(...msg); // eslint-disable-line no-console
};

async function webCam() {
  // initialize webcam
  // @ts-ignore resizeMode is not yet defined in tslib
  const cameraOptions = {
    audio: false,
    video: { facingMode: "user", resizeMode: "none", width: { ideal: document.body.clientWidth } }
  };
  const stream = await navigator.mediaDevices.getUserMedia(cameraOptions);
  const ready = new Promise(resolve => { dom.video.onloadeddata = () => resolve(true) });
  dom.video.srcObject = stream;
  void dom.video.play();
  await ready;
  dom.canvas.width = dom.video.videoWidth;
  dom.canvas.height = dom.video.videoHeight;
  // dom.canvas.style.width = "50%";
  // dom.canvas.style.height = "50%";
  if (human.env.initial) log("video:", dom.video.videoWidth, dom.video.videoHeight, "|", stream.getVideoTracks()[0].label);
  dom.canvas.onclick = () => {
    // pause when clicked on screen and resume on next click
    if (dom.video.paused) void dom.video.play();
    else dom.video.pause();
  };
};

async function detectionLoop() {
  // main detection loop
  if (!dom.video.paused) {
    if (current.face?.tensor) human.tf.dispose(current.face.tensor); // dispose previous tensor
    await human.detect(dom.video); // actual detection; were not capturing output in a local variable as it can also be reached via human.result
    const now = human.now();
    ok.detectFPS.val = Math.round(10000 / (now - timestamp.detect)) / 10;
    timestamp.detect = now;
    requestAnimationFrame(detectionLoop); // start new frame immediately
  };
};

function drawValidationTests() {
  let y = 32;
  for (const [key, val] of Object.entries(ok)) {
    let el = document.getElementById(`ok-${key}`);
    if (!el) {
      el = document.createElement("div");
      el.id = `ok-${key}`;
      el.innerText = key;
      el.className = "ok";
      el.style.top = `${y}px`;
      dom.ok.appendChild(el);
    };
    if (typeof val.status === "boolean") el.style.backgroundColor = val.status ? "lightgreen" : "lightcoral";
    const status = val.status ? "ok" : "fail";
    el.innerText = `${key}: ${val.val === 0 ? status : val.val}`;
    y += 28;
  }
}

async function drawDB() {
  dom.db.innerHTML = '<tr><th>ID</th><th>Nombre</th><th></th></tr>';
  let db = await indexDb.load();
  for (const entry of db) {
      let row = document.createElement("tr");
      dom.db.appendChild(row);

      let id = document.createElement("td");
      id.innerText = entry.id;
      row.appendChild(id);

      let name = document.createElement("td");
      name.innerText = entry.name;
      row.appendChild(name);

      // let dt = document.createElement("td");
      // dt.innerText = entry.dt?.toISOString();
      // row.appendChild(dt);

      let del = document.createElement("td");
      let btn = document.createElement("button");
      btn.innerText = '🗑️';
      btn.onclick =()=>{
        indexDb.remove(entry);
        drawDB();
      }
      del.appendChild(btn);
      row.appendChild(del);
  }
}


async function validationLoop() {
  // main screen refresh loop
  const interpolated = human.next(human.result); // smoothen result using last-known results
  human.draw.canvas(dom.video, dom.canvas); // draw canvas to screen
  await human.draw.all(dom.canvas, interpolated); // draw labels, boxes, lines, etc.
  const now = human.now();
  ok.drawFPS.val = Math.round(10000 / (now - timestamp.draw)) / 10;
  timestamp.draw = now;
  ok.faceCount.val = human.result.face.length;
  ok.faceCount.status = ok.faceCount.val === 1; // must be exactly detected face
  if (ok.faceCount.status) {
    // skip the rest if no face
    const gestures = Object.values(human.result.gesture).map(gesture => gesture.gesture); // flatten all gestures
    ok.facingCenter.status = gestures.includes("facing center");
    ok.faceConfidence.val = human.result.face[0].faceScore || human.result.face[0].boxScore || 0;
    ok.faceConfidence.status = ok.faceConfidence.val >= options.minConfidence;
    ok.antispoofCheck.val = human.result.face[0].real || 0;
    ok.antispoofCheck.status = ok.antispoofCheck.val >= options.minConfidence;
    ok.livenessCheck.val = human.result.face[0].live || 0;
    ok.livenessCheck.status = ok.livenessCheck.val >= options.minConfidence;
    ok.faceSize.val = Math.min(human.result.face[0].box[2], human.result.face[0].box[3]);
    ok.faceSize.status = ok.faceSize.val >= options.minSize;
    ok.distance.val = human.result.face[0].distance || 0;
    ok.distance.status = ok.distance.val >= options.distanceMin && ok.distance.val <= options.distanceMax;
    ok.descriptor.val = human.result.face[0].embedding?.length || 0;
    ok.descriptor.status = ok.descriptor.val > 0;
  }
  // run again
  ok.timeout.status = ok.elapsedMs.val <= options.maxTime;
  drawValidationTests();
  if (allOk() || !ok.timeout.status) {
    // all criteria met
    dom.video.pause();
    return human.result.face[0];
  }
  ok.elapsedMs.val = Math.trunc(human.now() - startTime)
  return new Promise(resolve => {
    setTimeout(async () => {
      await validationLoop(); // run validation loop until conditions are met
      resolve(human.result.face[0]); // recursive promise resolve
    }, 30); // use to slow down refresh from max refresh rate to target of 30 fps
  });
}

async function saveRecords() {
  if (dom.name.value.length > 0) {
    const image = dom.canvas.getContext("2d")?.getImageData(0, 0, dom.canvas.width, dom.canvas.height);
    const rec = { id: 0, name: dom.name.value, descriptor: current.face?.embedding, image, dt: new Date() };
    await indexDb.save(rec);
    log("saved face record:", rec.name, "descriptor length:", current.face?.embedding?.length);
    log("known face records:", await indexDb.count());
  } else log("invalid name");
  main();
}

async function deleteRecord() {
  if (current.record && current.record.id > 0) await indexDb.remove(current.record);
  main();
}

async function detectFace() {
  dom.canvas.style.height = "";
  dom.canvas.getContext("2d")?.clearRect(0, 0, options.minSize, options.minSize);
  if (!current?.face?.tensor || !current?.face?.embedding) return false;
  console.log("face record:", current.face); // eslint-disable-line no-console
  log(`detected face: ${current.face.gender} ${current.face.age || 0}y distance ${100 * (current.face.distance || 0)}cm/${Math.round((100 * (current.face.distance || 0)) / 2.54)}in`);

  await human.tf.browser.draw(current.face.tensor, dom.canvas);
  if ((await indexDb.count()) === 0) {
    log("face database is empty: nothing to compare face with");
    //document.body.style.background = "black";
    //dom.delete.style.display = "none";
    return false;
  }
  const db = await indexDb.load();
  const descriptors = db.map(rec => rec.descriptor).filter(desc => desc.length > 0);
  const res = human.match.find(current.face.embedding, descriptors, matchOptions);
  current.record = db[res.index] || null;
  if (current.record) {
    dom.best.innerText=`best match: [${current.record.id}] ${current.record.name} (${Math.round(1000 * res.similarity) / 10}%)`;
    log(`best match: ${current.record.name} | id: ${current.record.id} | similarity: ${Math.round(1000 * res.similarity) / 10}%`);
    dom.name.value = current.record.name;
  }else dom.best.innerText='';
  //document.body.style.background = res.similarity > options.threshold ? "darkgreen" : "maroon";
  return res.similarity > options.threshold;
}

async function main() {
  // main entry point
  ok.faceCount.status = false;
  ok.faceConfidence.status = false;
  ok.facingCenter.status = false;
  //ok.blinkDetected.status = false;
  ok.faceSize.status = false;
  ok.antispoofCheck.status = false;
  ok.livenessCheck.status = false;
  //ok.age.status = false;
  //ok.gender.status = false;
  ok.elapsedMs.val = 0;
  dom.ok.style.display = "block";
  dom.match.style.display = "none";
  //dom.canvas.style.height = "50%";
  //document.body.style.background = "black";
  await webCam();
  await detectionLoop(); // start detection loop
  startTime = human.now();
  current.face = await validationLoop(); // start validation loop

  dom.canvas.width = current.face?.tensor?.shape[1] || options.minSize;
  dom.canvas.height = current.face?.tensor?.shape[0] || options.minSize;
  dom.canvas.style.width = "";
  dom.match.style.display = "flex";
  dom.ok.style.display = "none";
  drawDB();

  if (!allOk()) {
    // is all criteria met?
    log("did not find valid face")
    return false
  }
  return detectFace()
}

async function init() {
  log("human version:", human.version, "| tfjs version:", human.tf.version["tfjs-core"]);
  log("options:", JSON.stringify(options).replace(/{|}|"|\[|\]/g, "").replace(/,/g, " "));
  log("initializing webcam...");
  await webCam(); // start webcam
  log("loading human models...");
  await human.load(); // preload all models
  log("initializing human...");
  log(
    "face embedding model:",
    humanConfig.face.description.enabled ? "faceres" : "",
    humanConfig.face["mobilefacenet"]?.enabled ? "mobilefacenet" : "",
    humanConfig.face["insightface"]?.enabled ? "insightface" : ""
  );
  log("loading face database...");
  log("known face records:", await indexDb.count());
  dom.retry.addEventListener("click", main);
  dom.save.addEventListener("click", saveRecords);
  dom.delete.addEventListener("click", deleteRecord);
  await human.warmup(); // warmup function to initialize backend for future faster detection
  await main();
}

window.onload = init;
