import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { City } from 'src/master-db/entities/city.entity';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { Repository } from 'typeorm';

@Injectable()
export class MasterGeoHelperService {
    constructor(
        @InjectRepository(Country)
        private readonly countryRepo: Repository<Country>,
        @InjectRepository(State)
        private readonly stateRepo: Repository<State>,
        @InjectRepository(City)
        private readonly cityRepo: Repository<City>,
    ) { }

    async getCountryNameById(countryId?: string | null): Promise<string | null> {
        if (!countryId?.trim()) {
            return null;
        }

        const country = await this.countryRepo.findOne({
            where: { id: countryId.trim() },
            select: { name: true },
        });

        return country?.name ?? null;
    }

    async getStateNameById(stateId?: string | null): Promise<string | null> {
        if (!stateId?.trim()) {
            return null;
        }

        const state = await this.stateRepo.findOne({
            where: { id: stateId.trim() },
            select: { name: true },
        });

        return state?.name ?? null;
    }

    async getCityNameById(cityId?: string | null): Promise<string | null> {
        if (!cityId?.trim()) {
            return null;
        }

        const city = await this.cityRepo.findOne({
            where: { id: cityId.trim() },
            select: { name: true },
        });

        return city?.name ?? null;
    }
}
