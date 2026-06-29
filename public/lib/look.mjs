// lib/look.mjs — 세션 ID → 캐릭터 외형(피부·헤어·셔츠·안경·헤드폰 등). 해시로 고정. 순수 함수.
import { hash } from './hash.mjs';
import { SKINS, HAIRS, HAIRHI, SHIRTS } from '../constants.mjs';

export function lookOf(id) {
  const h = hash(id);
  const hi = (h >>> 3) % HAIRS.length;
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[hi], hairHi: HAIRHI[hi],
    shirt: SHIRTS[(h >>> 7) % SHIRTS.length],
    deskKind: (h >>> 16) % 3,
    hairStyle: (h >>> 21) % 4,       // 0 숏컷 1 사이드 2 롱헤어 3 똥머리
    glasses: (h >>> 23) % 3 === 0,
    headphone: (h >>> 25) % 4 === 0,
    collar: (h >>> 27) % 2 === 0,
    phase: (h % 100) / 100 * Math.PI * 2,
  };
}
