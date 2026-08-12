/**
 * Preset Environment Configurations for Classroom CFD Simulation
 */
const SIM_PRESETS = {
    summerCooling: {
        name: '夏期冷房標準',
        initTemp: 30.0,
        outletTemp: 16.0,
        isSweepMode: false,
        finAngleDeg: 45.0,
        sweepSpeedSec: 8.0,
        powerRating: 2.3,
        windowCondition: 'summer'
    },
    winterHeating: {
        name: '冬期暖房標準',
        initTemp: 14.0,
        outletTemp: 36.0,
        isSweepMode: false,
        finAngleDeg: 65.0, // Strong downward blow for heating buoyancy
        sweepSpeedSec: 8.0,
        powerRating: 2.3,
        windowCondition: 'winter'
    },
    rapidCoolSweep: {
        name: '急速冷房スウィープ',
        initTemp: 32.0,
        outletTemp: 14.0,
        isSweepMode: true,
        finAngleDeg: 45.0,
        sweepSpeedSec: 6.0,
        powerRating: 3.0,
        windowCondition: 'summer'
    }
};
