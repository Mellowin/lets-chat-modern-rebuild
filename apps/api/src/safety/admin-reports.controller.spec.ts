import { Test, TestingModule } from '@nestjs/testing';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { ReportStatus } from './dto/admin-report-query.dto';

describe('AdminReportsController', () => {
  let controller: AdminReportsController;

  const fakeService = {
    listReports: jest.fn(),
    getReport: jest.fn(),
    updateReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminReportsController],
      providers: [{ provide: AdminReportsService, useValue: fakeService }],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminReportsController);
    jest.clearAllMocks();
  });

  it('lists reports with status filter', async () => {
    fakeService.listReports.mockResolvedValue({
      items: [{ id: 'r1', status: ReportStatus.OPEN }],
      nextCursor: null,
    });

    const result = await controller.findAll({
      status: ReportStatus.OPEN,
      limit: 20,
    });

    expect(fakeService.listReports).toHaveBeenCalledWith({
      status: ReportStatus.OPEN,
      cursor: undefined,
      limit: 20,
    });
    expect(result.items).toHaveLength(1);
  });

  it('gets a single report', async () => {
    fakeService.getReport.mockResolvedValue({ id: 'r1' });
    const result = await controller.findOne('r1');
    expect(fakeService.getReport).toHaveBeenCalledWith('r1');
    expect(result.id).toBe('r1');
  });

  it('updates a report status and note', async () => {
    const user = {
      id: 'admin-id',
      role: 'ADMIN',
    } as unknown as Parameters<AdminReportsController['update']>[2];
    fakeService.updateReport.mockResolvedValue({
      id: 'r1',
      status: ReportStatus.REVIEWED,
    });

    const result = await controller.update(
      'r1',
      { status: ReportStatus.REVIEWED, adminNote: 'note' },
      user,
    );

    expect(fakeService.updateReport).toHaveBeenCalledWith('r1', 'admin-id', {
      status: ReportStatus.REVIEWED,
      adminNote: 'note',
    });
    expect(result.status).toBe(ReportStatus.REVIEWED);
  });
});
