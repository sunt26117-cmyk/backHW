import { buildDeviceParameterCandidates } from '../src/utils/deviceParameterCandidates';
import { DeviceEntry } from '../src/utils/deviceLibrary';

const device: DeviceEntry = {
  id: 'test_dev', deviceType: 'MOSFET', partNumber: 'TEST-40V', manufacturer: 'Test', package: 'QFN', aecqGrade: 'AEC-Q101', channelType: 'N-CH', createdAt: '', updatedAt: '',
  raw: {
    maxRatings: {
      vds: { value: 40, unit: 'V', source: 'Table 3', conditions: { tj: 25 } },
      tjMax: { value: 175, unit: '℃', source: 'Table 3' },
      easPulse: { value: 120, unit: 'mJ', source: 'Table 3' },
    },
    staticParams: {
      rdsOn: { points: [{x:25,y:2.8},{x:125,y:4.5}], source: 'Fig. 5', conditions: {vgs:10,id:20} },
      vth: { points: [{x:25,y:1.8},{x:125,y:1.5}], source: 'Fig. 7', conditions: {id:0.00025} },
    },
    capacitanceParams: {
      ciss: {value: 1200, source: 'Table 6', conditions:{vds:25,vgs:0,f:1000000}},
      crss: {points:[{x:10,y:100},{x:25,y:45},{x:50,y:25}], source:'Fig. 9', conditions:{vgs:0,f:1000000}},
    },
    gateCharge: {
      qg:{value:18,source:'Fig. 10',conditions:{vds:24,id:20,vgs:10}}, qgs:{value:4,source:'Fig.10'}, qgd:{value:7,source:'Fig.10'}
    },
    switchingParams: {
      tr:{value:8,source:'Table 8',conditions:{vdd:24,id:20,rg:4.7}}, tf:{value:10,source:'Table 8',conditions:{vdd:24,id:20,rg:4.7}}, tdOn:{value:12,source:'Table 8'}, tdOff:{value:20,source:'Table 8'}
    },
    thermalParams: { rthJc:{value:1.2,source:'Table 10'}, rthJa:{value:45,source:'Table 10'} },
    bodyDiode: { vf:{value:1.0,source:'Table 9'}, qrr:{value:35,source:'Table 9'}, trr:{value:80,source:'Table 9'} },
  }
};

const candidates = buildDeviceParameterCandidates(device);
const keys = new Set(candidates.map(c => c.targetKey));
for (const required of ['vdsRatingV','rdsOnMilliOhm','vthMinV','cgdPf','cgsPf','gateChargeQgNc','turnOffDelayNs','fallTimeNs','qrrNc','easEnergyMj']) {
  if (!keys.has(required)) throw new Error(`缺候选映射: ${required}`);
}
const cgs = candidates.find(c => c.targetKey === 'cgsPf');
if (!cgs || Number(cgs.value) !== 1155) throw new Error('Cgs 推导失败');
if (keys.has('junctionTempC')) throw new Error('Tjmax 不应映射为当前工况 junctionTempC');
console.log(`verify-device-parameter-import: PASS (${candidates.length} candidates)`);
