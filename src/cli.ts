import caporal from 'caporal';
import { prompt } from 'enquirer';
import { PhilipsTV } from './philipstv';

const cli = caporal;

interface PinResponse {
    pin: string;
}

cli.version('0.0.1')
    .command('info', 'Fetch information from TV')
    .argument('<host>', 'TV IP Address', cli.STRING)
    .action(async(args, option, logger) => {
        try {
            const philipsTv = new PhilipsTV(args.host);
            const result = await philipsTv.info();
            logger.info(result);
        } catch (error) {
            logger.error(error.message);
            logger.debug(error.stack);
        } finally {
            process.exit();
        }
    })
    .command('pair', 'Performs pairing with TV to generate API user and password')
    .argument('<host>', 'TV IP Address', cli.STRING)
    .action(async(args, option, logger) => {
        try {
            const philipsTv = new PhilipsTV(args.host);
            
            const result = await philipsTv.pair(async() : Promise<string> => {
                const response : PinResponse = await prompt({
                    type: 'input',
                    name: 'pin',
                    message: 'Please enter the four-digit PIN.',
                });
                return response.pin;
            });

            logger.info(result);
        } catch (error) {
            logger.error(error.message);
            logger.debug(error.stack);
        } finally {
            process.exit();
        }
    });

cli.parse(process.argv);