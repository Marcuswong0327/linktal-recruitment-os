import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { PrismaService } from '../prisma/prisma.service';

describe('ClientsService.create', () => {
  it('creates without setting displayId (DB sequence owns it) and returns the row', async () => {
    const created = { id: 'cl1', displayId: 'Client-0101', companyName: 'Acme Corp' };
    const create = jest.fn().mockResolvedValue(created);
    const prisma = { client: { create } } as unknown as PrismaService;
    const service = new ClientsService(prisma);

    const dto: CreateClientDto = { companyName: 'Acme Corp' };
    const result = await service.create(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).not.toHaveProperty('displayId');
    expect(result).toBe(created);
  });
});
