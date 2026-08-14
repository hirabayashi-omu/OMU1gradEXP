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
        windowCondition: 'summer',
        circulatorEnabled: false,
        circulatorSpeed: 2.6,
        circulatorSwing: true
    },
    winterHeating: {
        name: '冬期暖房標準',
        initTemp: 14.0,
        outletTemp: 36.0,
        isSweepMode: false,
        finAngleDeg: 65.0, // Strong downward blow for heating buoyancy
        sweepSpeedSec: 8.0,
        powerRating: 2.3,
        windowCondition: 'winter',
        circulatorEnabled: false,
        circulatorSpeed: 2.6,
        circulatorSwing: true
    },
    rapidCoolSweep: {
        name: '急速冷房スウィープ',
        initTemp: 32.0,
        outletTemp: 14.0,
        isSweepMode: true,
        finAngleDeg: 45.0,
        sweepSpeedSec: 6.0,
        powerRating: 3.0,
        windowCondition: 'summer',
        circulatorEnabled: false,
        circulatorSpeed: 3.4,
        circulatorSwing: true
    },
    summerCirculatorCool: {
        name: '冷房＋サーキュレータ併用',
        initTemp: 30.0,
        outletTemp: 16.0,
        isSweepMode: false,
        finAngleDeg: 45.0,
        sweepSpeedSec: 8.0,
        powerRating: 2.3,
        windowCondition: 'summer',
        circulatorEnabled: true,
        circulatorSpeed: 2.6,
        circulatorSwing: true
    }
};