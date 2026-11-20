// Mara Voss's six-job story, plus the repeatable work that keeps Solana
// Bay profitable after the credits: taxis, a checkpoint race and the
// Chop Shop.  Missions are stage machines; each stage is a place to reach,
// a zone to hold, a pickup to grab, or a chain of checkpoints.

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class MissionManager {
  constructor(locations) {
    this.locations = locations;
    this.story = this.buildStory(locations);
    this.index = 0;
    this.completed = false;
    this.stageIndex = 0;
    this.stageStarted = false;
    this.hold = 0;
    this.stageTime = 0;
    this.checkpoint = 0;
    this.pickups = [];
    this.lastReward = 0;
  }

  buildStory(L) {
    return [
      {
        title: 'First Wheels',
        giver: 'Mara Voss',
        intro: 'Mara: “Wheels first, questions later. Take the coupe and get it to Harbor Garage.”',
        reward: 150,
        stages: [
          { type: 'goto', pos: L.startCar, radius: 6, text: 'Get into the coupe by the marina road', requireCar: false },
          { type: 'goto', pos: L.garageZone, radius: 9, text: 'Drive to Harbor Garage', requireCar: true },
        ],
      },
      {
        title: 'Package Run',
        giver: 'Mara Voss',
        intro: 'Mara: “A quiet package waits at Warehouse 9. Rico’s buyers are at the Mall. Do not open it.”',
        reward: 300,
        stages: [
          { type: 'goto', pos: L.docksPickup, radius: 7, text: 'Pick up the package at Warehouse 9' },
          { type: 'goto', pos: L.mallDoor, radius: 9, text: 'Deliver the package to Solana Mall', requireCar: true, wantedSet: 2 },
        ],
      },
      {
        title: 'Debt Call',
        giver: 'Mara Voss',
        intro: 'Mara: “Three of Vasco’s collectors are shaking down Old Market. Stand your ground, take the cash.”',
        reward: 220,
        stages: [
          { type: 'goto', pos: { x: -111, z: 62 }, radius: 6, text: 'Confront the first enforcer at Old Market' },
          { type: 'hold', pos: { x: -111, z: 62 }, radius: 5.5, duration: 3, text: 'Stand your ground — enforcer one' },
          { type: 'collect', pos: { x: -108, z: 65 }, radius: 3.2, amount: 65, text: 'Grab the dropped cash' },
          { type: 'goto', pos: { x: -91, z: 73 }, radius: 6, text: 'Confront the second enforcer' },
          { type: 'hold', pos: { x: -91, z: 73 }, radius: 5.5, duration: 3, text: 'Stand your ground — enforcer two' },
          { type: 'collect', pos: { x: -88, z: 70 }, radius: 3.2, amount: 80, text: 'Grab the dropped cash' },
          { type: 'goto', pos: { x: -100, z: 56 }, radius: 6, text: 'Confront the last enforcer' },
          { type: 'hold', pos: { x: -100, z: 56 }, radius: 5.5, duration: 3, text: 'Stand your ground — last enforcer' },
          { type: 'collect', pos: { x: -103, z: 59 }, radius: 3.2, amount: 90, text: 'Grab the dropped cash' },
        ],
      },
      {
        title: 'Night Courier',
        giver: 'Mara Voss',
        intro: 'Mara: “This one moves after dark. Neon Row to the Pier Cafe — and stay out of AIR ONE’s light.”',
        reward: 425,
        stages: [
          { type: 'goto', pos: { x: -36, z: 8 }, radius: 7, text: 'Collect the courier case on Neon Row' },
          { type: 'goto', pos: { x: -48, z: 100 }, radius: 9, text: 'Deliver to Pier Cafe at the marina', timer: 105, wantedSet: 3 },
        ],
      },
      {
        title: 'The Vault Job',
        giver: 'Mara Voss',
        intro: 'Mara: “CITY BANK keeps Rico’s ledger in the vault. Hold the floor, then run for the Garage.”',
        reward: 800,
        stages: [
          { type: 'goto', pos: L.bankDoor, radius: 7, text: 'Enter the CITY BANK zone' },
          { type: 'hold', pos: L.bankDoor, radius: 7, duration: 12, text: 'Crack the vault — hold the bank zone', wantedSet: 4 },
          { type: 'goto', pos: L.garageZone, radius: 10, text: 'Escape to Harbor Garage', requireCar: true },
        ],
      },
      {
        title: 'Harbor Heat',
        giver: 'Mara Voss',
        intro: 'Mara: “Rico sold us out. Hit every checkpoint, reach the boat, and leave Solana Bay burning behind you.”',
        reward: 1200,
        stages: [
          {
            type: 'checkpoints',
            points: [
              { x: -75, z: 90 }, { x: 25, z: 90 }, { x: 100, z: 90 },
              { x: 75, z: 0 }, { x: 0, z: -45 }, { x: 0, z: 90 },
              { x: 0, z: 132 }, L.marinaBoat,
            ],
            radius: 9,
            timer: 115,
            text: 'Run the Harbor Heat checkpoints to the boat',
            wantedSet: 5,
          },
        ],
      },
    ];
  }

  get mission() {
    return this.completed ? null : this.story[this.index];
  }

  get stage() {
    const mission = this.mission;
    return mission ? mission.stages[this.stageIndex] : null;
  }

  get marker() {
    const stage = this.stage;
    if (!stage) return null;
    if (stage.type === 'checkpoints') return stage.points[this.checkpoint] || null;
    return stage.pos;
  }

  get objective() {
    const stage = this.stage;
    if (!stage) return 'Free roam — taxi, race, chop cars, or explore Solana Bay';
    if (stage.type === 'hold') {
      return `${stage.text} (${Math.max(0, stage.duration - this.hold).toFixed(1)}s)`;
    }
    if (stage.type === 'checkpoints') {
      return `${stage.text} — ${this.checkpoint + 1}/${stage.points.length}`;
    }
    return stage.text;
  }

  get timer() {
    const stage = this.stage;
    if (!stage || !stage.timer) return null;
    return Math.max(0, stage.timer - this.stageTime);
  }

  startAt(index, callbacks = {}) {
    this.index = Math.min(index, this.story.length);
    this.completed = this.index >= this.story.length;
    this.stageIndex = 0;
    this.beginStage(callbacks, true);
  }

  beginStage(callbacks = {}, announce = false) {
    this.stageStarted = true;
    this.stageTime = 0;
    this.hold = 0;
    this.checkpoint = 0;
    this.pickups = [];
    const mission = this.mission;
    const stage = this.stage;
    if (!mission || !stage) return;
    if (announce && callbacks.dialog) callbacks.dialog(mission.giver, mission.intro);
    if (stage.wantedSet && callbacks.setWanted) callbacks.setWanted(stage.wantedSet);
    if (stage.wantedAdd && callbacks.reportWanted) callbacks.reportWanted(stage.wantedAdd, mission.title);
    if (stage.type === 'collect') {
      this.pickups.push({ pos: stage.pos, amount: stage.amount, taken: false });
    }
  }

  advance(callbacks) {
    const mission = this.mission;
    this.stageIndex++;
    if (mission && this.stageIndex >= mission.stages.length) {
      const reward = mission.reward;
      this.lastReward = reward;
      if (callbacks.addCash) callbacks.addCash(reward, mission.title);
      if (callbacks.dialog) callbacks.dialog('Mara Voss', `“Done. $${reward} is yours. Rico is running out of places to hide.”`);
      if (callbacks.missionComplete) callbacks.missionComplete(mission, reward);
      this.index++;
      this.stageIndex = 0;
      this.completed = this.index >= this.story.length;
      if (this.completed && callbacks.storyComplete) callbacks.storyComplete();
      this.beginStage(callbacks, true);
    } else {
      this.beginStage(callbacks, false);
    }
  }

  fail(callbacks) {
    if (callbacks.toast) callbacks.toast('Mission failed — the stage restarts. No reward lost.');
    if (callbacks.dialog) callbacks.dialog('Mara Voss', '“Shake it off. Same job, cleaner run.”');
    this.beginStage(callbacks, false);
  }

  update(dt, context) {
    const stage = this.stage;
    if (!stage) return;
    this.stageTime += dt;
    if (stage.timer && this.stageTime > stage.timer) {
      this.fail(context);
      return;
    }
    const marker = this.marker;
    if (!marker) return;
    const near = distance(context.pos, marker) <= (stage.radius || 7);
    if (stage.requireCar && near && !context.inCar) {
      if (context.setPrompt) context.setPrompt('You need a car for this objective');
      return;
    }
    if (stage.type === 'goto' || stage.type === 'pickup') {
      if (near) this.advance(context);
      return;
    }
    if (stage.type === 'collect') {
      const pickup = this.pickups[0];
      if (pickup && near) {
        pickup.taken = true;
        if (context.addCash) context.addCash(pickup.amount, 'cash pickup');
        if (context.pickupSound) context.pickupSound();
        this.advance(context);
      }
      return;
    }
    if (stage.type === 'hold') {
      const still = context.inCar ? Math.abs(context.speed || 0) < 1.2 : true;
      if (near && still) {
        this.hold += dt;
        if (context.setPrompt) context.setPrompt(`Hold the zone… ${Math.ceil(stage.duration - this.hold)}`);
        if (this.hold >= stage.duration) this.advance(context);
      } else {
        this.hold = Math.max(0, this.hold - dt * 1.6);
      }
      return;
    }
    if (stage.type === 'checkpoints') {
      if (near) {
        this.checkpoint++;
        if (context.pickupSound) context.pickupSound();
        if (this.checkpoint >= stage.points.length) this.advance(context);
        else if (context.toast) context.toast(`Checkpoint ${this.checkpoint}/${stage.points.length}`);
      }
    }
  }
}

export class SideJobs {
  constructor(locations, rng) {
    this.locations = locations;
    this.rng = rng;
    this.taxi = null;
    this.race = null;
    this.chopCooldown = 0;
    this.destinations = [
      { name: 'Solana Mall', pos: locations.mallDoor },
      { name: 'Pier Cafe', pos: { x: -48, z: 100 } },
      { name: 'Harbor Garage', pos: locations.garageZone },
      { name: 'Old Market', pos: locations.oldMarket },
      { name: 'Warehouse 9', pos: locations.docksPickup },
      { name: 'CITY BANK', pos: locations.bankDoor },
    ];
    this.racePoints = [
      { x: -75, z: 90 }, { x: 25, z: 90 }, { x: 100, z: 90 },
      { x: 75, z: 0 }, { x: 0, z: -90 }, { x: -75, z: 0 },
      { x: -125, z: 45 }, { x: -142, z: 90 },
    ];
  }

  update(dt) {
    this.chopCooldown = Math.max(0, this.chopCooldown - dt);
    if (this.race) this.race.time += dt;
    if (this.taxi) this.taxi.time += dt;
  }

  startTaxi(passenger) {
    const destination = this.destinations[Math.floor(this.rng() * this.destinations.length)];
    this.taxi = {
      passenger,
      destination: destination.pos,
      destinationName: destination.name,
      phase: 'board',
      time: 0,
      distance: Math.hypot(destination.pos.x - passenger.pos.x, destination.pos.z - passenger.pos.z),
    };
    return this.taxi;
  }

  updateTaxi(pos, inCar) {
    if (!this.taxi) return null;
    if (this.taxi.phase === 'board') {
      if (inCar && Math.hypot(pos.x - this.taxi.passenger.pos.x, pos.z - this.taxi.passenger.pos.z) < 5) {
        this.taxi.phase = 'deliver';
        return { type: 'boarded', job: this.taxi };
      }
      return null;
    }
    if (inCar && Math.hypot(pos.x - this.taxi.destination.x, pos.z - this.taxi.destination.z) < 9) {
      const fare = Math.round(35 + this.taxi.distance * 0.55 + Math.max(0, 45 - this.taxi.time) * 0.35);
      const job = this.taxi;
      this.taxi = null;
      return { type: 'fare', fare, job };
    }
    return null;
  }

  cancelTaxi() {
    this.taxi = null;
  }

  startRace() {
    this.race = { index: 0, time: 0, par: 105, points: this.racePoints };
    return this.race;
  }

  updateRace(pos) {
    if (!this.race) return null;
    const point = this.race.points[this.race.index];
    if (Math.hypot(pos.x - point.x, pos.z - point.z) < 10) {
      this.race.index++;
      if (this.race.index >= this.race.points.length) {
        const time = this.race.time;
        const reward = time <= this.race.par ? 350 : 150;
        this.race = null;
        return { type: 'finish', time, reward };
      }
      return { type: 'checkpoint', index: this.race.index, total: this.race.points.length };
    }
    if (this.race.time > 240) {
      this.race = null;
      return { type: 'timeout' };
    }
    return null;
  }

  get activeMarker() {
    if (this.taxi && this.taxi.phase === 'deliver') return this.taxi.destination;
    if (this.taxi) return this.taxi.passenger.pos;
    if (this.race) return this.race.points[this.race.index];
    return null;
  }

  get objective() {
    if (this.taxi) {
      return this.taxi.phase === 'board'
        ? 'Taxi: stop beside your passenger'
        : `Taxi: take your fare to ${this.taxi.destinationName}`;
    }
    if (this.race) {
      return `Harbor Run: checkpoint ${this.race.index + 1}/${this.race.points.length} — ${this.race.time.toFixed(1)}s`;
    }
    return null;
  }

  chopValue(car) {
    return Math.round((car.topSpeedKmh * 1.15 + car.health * 0.45) * (car.stolen ? 1 : 0.72));
  }

  sellAtChopShop(car) {
    if (this.chopCooldown > 0) return 0;
    const value = this.chopValue(car);
    this.chopCooldown = 60;
    return value;
  }
}
