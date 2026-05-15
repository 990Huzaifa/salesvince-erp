import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { Country } from '../entities/country.entity';
import { State } from '../entities/state.entity';
import { City } from '../entities/city.entity';

export async function geoDataSeeder(dataSource: DataSource) {
    const countryRepo = dataSource.getRepository(Country);
    const stateRepo = dataSource.getRepository(State);
    const cityRepo = dataSource.getRepository(City);

    console.log('🌱 Seeding geo data...');
    
    // Read cities JSON file
    // Read JSON files
    const countriesData = JSON.parse(fs.readFileSync('src/master-db/seed-data/countries.json', 'utf-8'));
    const statesData = JSON.parse(fs.readFileSync('src/master-db/seed-data/states.json', 'utf-8'));
    const citiesData = JSON.parse(fs.readFileSync('src/master-db/seed-data/cities_10.json', 'utf-8'));
        
    console.log(`📊 Loaded ${citiesData.length} Cities`);

    // Insert countries (batch insert)
    // for (const Country of countriesData) {
    //     // Check if the country already exists in the database based on the 'iso_code'
    //     const existingCountry = await countryRepo.findOne({ where: { iso_code: Country.iso3 } });

    //     if (existingCountry) {
    //         // If country exists, update its name and code
    //         existingCountry.id = Country.id; // Ensure we also update the ID if it has changed

    //         // Save the updated country
    //         await countryRepo.save(existingCountry);
    //         console.log(`✅ Country with ID ${existingCountry.id} updated.`);
    //     } else {

    //         // If country doesn't exist, create a new one
    //         const newCountry = countryRepo.create({
    //             // id: Country.id, // Ensure we set the ID
    //             name: Country.name,
    //             iso_code: Country.iso3
    //         });

    //         // Insert the new country
    //         await countryRepo.save(newCountry);
    //         console.log(`✅ New country with ID ${newCountry.id} inserted.`);
    //     }
    // }
    // console.log('✅ Countries seeded.');

    // Insert states (batch insert)
    // for (const state of statesData) {

    //     // Check if the state already exists in the database based on the 'id'
    //     const existingState = await stateRepo.findOne({ where: { name: state.name } });

    //     if (existingState) {
    //         // If state exists, update its name and code
    //         // existingState.id = state.id; // Ensure we also update the ID if it has changed

    //         // // Save the updated state
    //         // await stateRepo.save(existingState);
    //         // console.log(`✅ State with ID ${existingState.id} updated.`);
    //         // skip
    //         // console.log(`⏭️ State with ID ${existingState.id} already exists. Skipping update.`);
    //     } else {
            
    //         await stateRepo.save( stateRepo.create({
    //             id: state.id,
    //             name: state.name,
    //             country_id: state.country_id,
    //             code: state.code
    //         }));
            
    //         console.log(`✅ New state with ID ${state.id} inserted.`);
    //     }

    // }
    // console.log('✅ States seeded.\n');

    // const validCities: City[] = [];

    // for (const city of citiesData) {

    //         const existingCity = await cityRepo.findOne({
    //             where: { id: city.id, state_id: city.state_id } // Check for both ID and state_id
    //         });

    //         if (!existingCity) {
    //             // If the city doesn't exist, create and push the new city entity
    //             const cityEntity = cityRepo.create({
    //                 id: city.id, // Ensure we set the ID
    //                 name: city.name,
    //                 state_id: city.state_id,
    //                 code: city.state_code
    //             });
    //             await cityRepo.save(cityEntity);

    //             console.log(`✅ New city with ID ${city.id} inserted.`);
    //         } else {
    //             // console.log(`❌ Skipping city with ID ${city.id} as it already exists.`);
    //         }

    // }

    console.log('🌱 Geo data seeding completed.\n');
}