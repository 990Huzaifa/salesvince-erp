import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { City } from 'src/master-db/entities/city.entity';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { DataSource, Like, Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';

@Injectable()
export class UtilityService {
    constructor(
        @InjectRepository(Country)
        private readonly countryRepo: Repository<Country>,
        @InjectRepository(State)
        private readonly stateRepo: Repository<State>,
        @InjectRepository(City)
        private readonly cityRepo: Repository<City>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
    ) {}

    // here we make public apis like countrys, states, cities etc

    async getCountries() {
        // ideally this should come from a database or external API, but for simplicity, we'll hardcode it here
        const countries = await this.countryRepo.find();
        return countries;
    }

    async getStates(countryId: any, name: string) {
        // this should ideally come from a database or external API, but for simplicity, we'll hardcode it here
        const states = await this.stateRepo.find({ 
            where: { country: { id: countryId } ,
                name: name ? Like(`%${name}%`) : undefined
            }, 
            order: { name: 'ASC' }
        });
        return states;
    }

    async getCities(stateId: any, name: string) {
        // this should ideally come from a database or external API, but for simplicity, we'll hardcode it here
        const cities = await this.cityRepo.find({ 
            where: { 
                state: { id: stateId },
                name: name ? Like(`%${name}%`) : undefined
            }, 
            order: { name: 'ASC' }
        });
        return cities;
    }

    async getIndustries() {
        // this should ideally come from a database or external API, but for simplicity, we'll hardcode it here

        return [
            'SOFTWARE',
            'RETAIL',
            'SERVICES',
            'BRAND',
            'MANUFACTURING',
            'WHOLESALE',
            'OTHER',
        ];
    }

    async getCurrencies() {
        // this should ideally come from a database or external API, but for simplicity, we'll hardcode it here
        return [
            'USD',
            'SAR',
            'KWD',
            'AED',
            'PKR',
        ];
    }

    async checkDomainAvailability(domain: string) {
        const checkDomain = await this.tenantRepo.findOne({ where: { name: domain } });
        if (checkDomain) {
            return {
                available: false,
                message: 'Domain is already taken',
            };
        }
        return {
            available: true,
            message: 'Domain is available',
        };
    }
}