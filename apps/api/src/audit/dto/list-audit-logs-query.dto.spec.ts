import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAuditLogsQueryDto } from './list-audit-logs-query.dto';

describe('ListAuditLogsQueryDto', () => {
  function validateDto(obj: Record<string, unknown>) {
    const dto = plainToInstance(ListAuditLogsQueryDto, obj);
    return validate(dto);
  }

  it('should accept limit=10', async () => {
    const errors = await validateDto({ limit: 10 });
    expect(errors).toHaveLength(0);
  });

  it('should default limit to 50 when missing', () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {});
    expect(dto.limit).toBe(50);
  });

  it('should reject limit=101', async () => {
    const errors = await validateDto({ limit: 101 });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('should reject limit=0', async () => {
    const errors = await validateDto({ limit: 0 });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('should reject limit=abc', async () => {
    const errors = await validateDto({ limit: 'abc' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('should reject limit=1.5', async () => {
    const errors = await validateDto({ limit: 1.5 });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });

  it('should reject limit=10abc', async () => {
    const errors = await validateDto({ limit: '10abc' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
  });
});
