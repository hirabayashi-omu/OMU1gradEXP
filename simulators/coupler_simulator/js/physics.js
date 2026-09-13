/**
 * physics.js - ??????? ????????????? & ????????????
 */

export const COUPLER_STATES = {
  DISCONNECTED: 'DISCONNECTED',   // ???? (???????????)
  APPROACHING:  'APPROACHING',    // ??? (????)
  ENGAGING:     'ENGAGING',       // ???????? (????????)
  LOCKED:       'LOCKED',         // ??????? (???????)
  UNLOCKED:     'UNLOCKED',       // ??????? (?????)
  FAILED:       'FAILED'          // ???????
};

export class CouplerPhysics {
  constructor() {
    this.massCarA = 36000;
    this.massCarB = 40000;
    
    this.posA = -1.8;
    this.velA = 0.0;
    this.posB = 0.0;
    this.velB = 0.0;
    this.bBrakeCarB = true;

    this.notchPower = 0;
    this.notchBrake = 0;
    this.reverser = 1;

    this.state = COUPLER_STATES.DISCONNECTED;
    
    this.knuckleAngleA = 28.0; 
    this.knuckleAngleB = 28.0;
    this.lockHeightA = 1.0;
    this.lockHeightB = 1.0;
    this.uncoupleLever = 0.0;

    this.draftStrokeA = 0.0;
    this.draftStrokeB = 0.0;
    this.draftVelA = 0.0;
    this.draftVelB = 0.0;
    this.draftMaxStroke = 0.082;
    this.kDraftMain = 5.8e6;
    this.cDraft = 1.1e5;
    this.kDraftBottom = 8.5e7;

    this.slackX = 0.012;
    this.slackY = 0.010;
    this.slackZ = 0.014;
    this.currentSlackX = 0.0;

    this.contactForceX = 0.0;
    this.contactForceY = 0.0;
    this.contactForceZ = 0.0;

    this.vibrationTime = 0.0;
    this.vibrationLevel = 1.0;
    this.vibA = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };
    this.vibB = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };

    this.couplingSpeed = 0.0;
    this.lastEvent = '??????????';
    this.couplingSuccess = null;
  }

  reset() {
    this.posA = -1.8;
    this.velA = 0.0;
    this.posB = 0.0;
    this.velB = 0.0;
    this.notchPower = 0;
    this.notchBrake = 0;
    this.reverser = 1;
    this.state = COUPLER_STATES.DISCONNECTED;
    this.knuckleAngleA = 28.0;
    this.knuckleAngleB = 28.0;
    this.lockHeightA = 1.0;
    this.lockHeightB = 1.0;
    this.uncoupleLever = 0.0;
    this.draftStrokeA = 0.0;
    this.draftStrokeB = 0.0;
    this.draftVelA = 0.0;
    this.draftVelB = 0.0;
    this.currentSlackX = 0.0;
    this.contactForceX = 0.0;
    this.contactForceY = 0.0;
    this.contactForceZ = 0.0;
    this.vibrationTime = 0.0;
    this.couplingSuccess = null;
    this.couplingSpeed = 0.0;
    this.lastEvent = '??????: ?????';
  }

  updateVibration(dt) {
    this.vibrationTime += dt;
    const t = this.vibrationTime;
    const s = this.vibrationLevel;
    const v = Math.abs(this.velA) + 0.2;

    const f1A = Math.sin(t * 2 * Math.PI * 0.8) * 0.004 + Math.sin(t * 2 * Math.PI * 1.4 + 0.5) * 0.003;
    const f2A = Math.sin(t * 2 * Math.PI * 4.2 + 1.2) * 0.0025 + Math.sin(t * 2 * Math.PI * 6.8 + 2.1) * 0.0018;
    const f3A = (Math.random() - 0.5) * 0.0015 * Math.sin(t * 2 * Math.PI * 25.0);

    this.vibA.y = (f1A * 1.2 + f2A * 0.8 + f3A) * s * Math.min(2.0, v * 0.8);
    this.vibA.z = (f1A * 1.5 + f2A * 1.0 + f3A * 0.5) * s * Math.min(2.0, v * 0.8);
    this.vibA.roll  = (f2A * 0.04 + f1A * 0.03) * s;
    this.vibA.pitch = (f1A * 0.03 + f2A * 0.02) * s;
    this.vibA.yaw   = (f1A * 0.035 + f2A * 0.015) * s;

    const f1B = Math.sin(t * 2 * Math.PI * 0.8 + 1.7) * 0.0035 + Math.sin(t * 2 * Math.PI * 1.3 + 2.8) * 0.0025;
    const f2B = Math.sin(t * 2 * Math.PI * 4.0 + 3.4) * 0.002;
    this.vibB.y = (f1B * 0.6 + f2B * 0.5) * s;
    this.vibB.z = (f1B * 0.7 + f2B * 0.6) * s;
    this.vibB.roll  = f2B * 0.02 * s;
    this.vibB.pitch = f1B * 0.015 * s;
    this.vibB.yaw   = f1B * 0.02 * s;
  }

  setUncoupleLever(val) {
    this.uncoupleLever = Math.max(0, Math.min(1, val));
    if (this.uncoupleLever > 0.4) {
      this.lockHeightA = Math.max(this.lockHeightA, this.uncoupleLever);
      if (this.state === COUPLER_STATES.LOCKED) {
        this.state = COUPLER_STATES.UNLOCKED;
        this.lastEvent = '??????: ????????';
      }
    } else if (this.state === COUPLER_STATES.UNLOCKED) {
      if (this.knuckleAngleA < 3.0) {
        this.lockHeightA = 0.0;
        this.state = COUPLER_STATES.LOCKED;
        this.lastEvent = '????: ???';
      }
    }
  }

  step(dt, materialEngine = null) {
    this.updateVibration(dt);

    let tractiveForce = 0;
    if (this.reverser !== 0) {
      tractiveForce = this.notchPower * 7500 * this.reverser;
    }
    
    let brakeForce = 0;
    if (this.notchBrake > 0) {
      const brakeCoeff = (this.notchBrake === 9) ? 65000 : (this.notchBrake * 5500);
      brakeForce = brakeCoeff * Math.sign(this.velA || tractiveForce || 0.001);
    }

    const rollingResistance = 1800 * Math.sign(this.velA);
    const airResistance = 120 * this.velA * Math.abs(this.velA);

    const relDist = this.posB - this.posA; 

    let forceX = 0;
    let forceY = 0;
    let forceZ = 0;

    if (this.state === COUPLER_STATES.DISCONNECTED) {
      this.lockHeightA = 0.8;
      this.lockHeightB = 0.8;
      this.knuckleAngleA = 28.0;
      this.knuckleAngleB = 28.0;

      if (relDist <= 0.28) {
        this.state = COUPLER_STATES.APPROACHING;
        this.lastEvent = '????: ???????';
      }
    }
    else if (this.state === COUPLER_STATES.APPROACHING) {
      if (relDist <= 0.18) {
        this.state = COUPLER_STATES.ENGAGING;
        this.lastEvent = '????????: ???????';
      } else if (relDist > 0.35) {
        this.state = COUPLER_STATES.DISCONNECTED;
      }
    }
    else if (this.state === COUPLER_STATES.ENGAGING) {
      const engageRatio = Math.max(0, Math.min(1, (0.18 - relDist) / 0.18));
      this.knuckleAngleA = 28.0 * (1.0 - engageRatio);
      this.knuckleAngleB = 28.0 * (1.0 - engageRatio);

      forceX = -engageRatio * 18000;

      if (engageRatio >= 0.98 && relDist <= 0.02) {
        this.knuckleAngleA = 0.0;
        this.knuckleAngleB = 0.0;
        this.lockHeightA = 0.0;
        this.lockHeightB = 0.0;
        this.state = COUPLER_STATES.LOCKED;
        this.couplingSpeed = (this.velA * 3.6).toFixed(1);

        const speedKmh = Math.abs(this.velA * 3.6);
        if (speedKmh > 12.0) {
          this.couplingSuccess = false;
          this.lastEvent = '?????? (' + speedKmh.toFixed(1) + ' km/h): ????????????';
        } else if (speedKmh < 1.0 && this.velA > 0) {
          this.couplingSuccess = false;
          this.lastEvent = '?????? (' + speedKmh.toFixed(1) + ' km/h): ??????';
        } else {
          this.couplingSuccess = true;
          this.lastEvent = '??????: ???? (' + speedKmh.toFixed(1) + ' km/h)';
        }
      } else if (this.velA < -0.05 && relDist > 0.20) {
        this.state = COUPLER_STATES.DISCONNECTED;
        this.lastEvent = '????: ????';
      }
    }
    else if (this.state === COUPLER_STATES.LOCKED) {
      this.knuckleAngleA = 0.0;
      this.knuckleAngleB = 0.0;
      this.lockHeightA = 0.0;
      this.lockHeightB = 0.0;

      const penetration = -relDist;

      if (Math.abs(penetration) <= this.slackX) {
        this.currentSlackX = penetration;
        forceX = -penetration * 2.5e4 - (this.velA - this.velB) * 8.0e2;
        this.draftStrokeA = 0.0;
        this.draftStrokeB = 0.0;
      } else {
        const netDeflection = penetration > 0 ? (penetration - this.slackX) : (penetration + this.slackX);
        const relVel = this.velA - this.velB;

        this.draftStrokeA = netDeflection * 0.5;
        this.draftStrokeB = netDeflection * 0.5;

        let springForce = 0;
        const absDef = Math.abs(netDeflection);

        if (absDef <= this.draftMaxStroke) {
          springForce = this.kDraftMain * netDeflection + this.cDraft * relVel;
        } else {
          const excess = absDef - this.draftMaxStroke;
          const sign = Math.sign(netDeflection);
          springForce = (this.kDraftMain * this.draftMaxStroke + this.kDraftBottom * excess) * sign + this.cDraft * relVel * 2.5;
        }

        forceX = -springForce;
      }

      const dy = this.vibA.y - this.vibB.y;
      const dz = this.vibA.z - this.vibB.z;
      forceY = -dy * 1.5e5 - (this.velA * 200);
      forceZ = -dz * 1.8e5;
    }
    else if (this.state === COUPLER_STATES.UNLOCKED) {
      this.lockHeightA = Math.max(0.6, this.uncoupleLever);
      
      if (this.velA < -0.05 || relDist > 0.02) {
        const pullDist = Math.max(0, relDist);
        this.knuckleAngleA = Math.min(28.0, pullDist * 200.0);
        this.knuckleAngleB = Math.min(28.0, pullDist * 200.0);

        if (relDist >= 0.25) {
          this.state = COUPLER_STATES.DISCONNECTED;
          this.lastEvent = '????: ???????????';
        }
      }
    }

    const netForceA = tractiveForce - brakeForce - rollingResistance - airResistance + forceX;
    const accelA = netForceA / this.massCarA;
    this.velA += accelA * dt;
    this.posA += this.velA * dt;

    let netForceB = -forceX;
    if (this.bBrakeCarB) {
      const frictionB = 75000 * Math.sign(this.velB || 0.001);
      netForceB -= frictionB;
    }
    const accelB = netForceB / this.massCarB;
    this.velB += accelB * dt;
    if (Math.abs(this.velB) < 0.002 && Math.abs(netForceB) < 70000) {
      this.velB = 0;
    }
    this.posB += this.velB * dt;

    this.contactForceX = forceX;
    this.contactForceY = forceY;
    this.contactForceZ = forceZ;

    if (materialEngine && materialEngine.isFractured) {
      this.state = COUPLER_STATES.FAILED;
      this.lastEvent = '??????: [' + materialEngine.failureMode + '] ????????????';
    }

    return {
      state: this.state,
      posA: this.posA,
      velA: this.velA,
      speedKmh: this.velA * 3.6,
      relDist: relDist,
      contactForceX: this.contactForceX,
      contactForceY: this.contactForceY,
      contactForceZ: this.contactForceZ,
      draftStrokeA: this.draftStrokeA,
      draftStrokeB: this.draftStrokeB,
      knuckleAngleA: this.knuckleAngleA,
      knuckleAngleB: this.knuckleAngleB,
      lockHeightA: this.lockHeightA,
      uncoupleLever: this.uncoupleLever,
      vibA: this.vibA,
      vibB: this.vibB,
      lastEvent: this.lastEvent,
      couplingSuccess: this.couplingSuccess
    };
  }
}