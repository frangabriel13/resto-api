import { staffActionDenial } from './staff-rules.js';

const employee = { role: 'EMPLOYEE' as const };
const owner = { role: 'OWNER' as const };

describe('staffActionDenial', () => {
  it('nada sobre un dueño', () => {
    for (const action of [
      'deactivate',
      'reactivate',
      'reset_password',
    ] as const) {
      expect(staffActionDenial(action, owner, 'ACTIVE')).toBe('STAFF_IS_OWNER');
    }
  });

  it('con el club activo o en preparación, todo sobre un empleado', () => {
    for (const status of ['DRAFT', 'ACTIVE'] as const) {
      expect(staffActionDenial('create', null, status)).toBeNull();
      expect(staffActionDenial('reactivate', employee, status)).toBeNull();
    }
  });

  it('pausado o finalizado: baja y reset sí, alta y reactivación no', () => {
    for (const status of ['PAUSED', 'ENDED'] as const) {
      expect(staffActionDenial('deactivate', employee, status)).toBeNull();
      expect(staffActionDenial('reset_password', employee, status)).toBeNull();
      expect(staffActionDenial('create', null, status)).toBe(
        'MERCHANT_READ_ONLY',
      );
      expect(staffActionDenial('reactivate', employee, status)).toBe(
        'MERCHANT_READ_ONLY',
      );
    }
  });
});
