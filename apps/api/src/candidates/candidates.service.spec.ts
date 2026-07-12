import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { PrismaService } from '../prisma/prisma.service';

describe('CandidatesService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'c1', displayId: 'CDD-0105', fullName: 'Jane Doe' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { candidate: { create } } as unknown as PrismaService;
    const service = new CandidatesService(prisma);

    const dto: CreateCandidateDto = { fullName: 'Jane Doe' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});
