import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { TripEntity } from './trip.entity';
import { TripStatus } from '../../constants/status';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../../common/errors/app.exception';

@Injectable()
export class TripService {
  constructor(@InjectRepository(TripEntity) private readonly trips: Repository<TripEntity>) {}

  create(input: Partial<TripEntity>) { return this.trips.save(this.trips.create(input)); }
  list() { return this.trips.find({ order: { departDate: 'ASC' } }); }

  async getById(id: number): Promise<TripEntity> {
    const trip = await this.trips.findOneBy({ id });
    if (!trip) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '行程不存在', 404);
    return trip;
  }

  match(destination: string, date: string, budgetMax: number) {
    return this.trips.find({ where: { destination, departDate: Between(date, date), budgetMax } });
  }

  /** 行程最后一天：出发日期 + 天数 - 1 */
  endDate(trip: TripEntity): Date {
    const end = new Date(`${trip.departDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + Math.max(1, trip.days) - 1);
    return end;
  }

  /** 行程是否已结束：状态为 FINISHED，或今天已超过行程最后一天 */
  isFinished(trip: TripEntity, now: Date = new Date()): boolean {
    if (trip.status === TripStatus.Finished) return true;
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return today.getTime() > this.endDate(trip).getTime();
  }

  /** 发起人手动结束行程（便于在最后一天当天即可发布） */
  async finish(id: number, userId: number): Promise<TripEntity> {
    const trip = await this.getById(id);
    if (trip.ownerId !== userId) throw new AppException(ERROR_CODES.NOT_TRIP_OWNER, '仅发起人可以结束行程', 403);
    if (trip.status !== TripStatus.Finished) {
      trip.status = TripStatus.Finished;
      await this.trips.save(trip);
    }
    return trip;
  }
}
