import chalk from 'chalk';
import fixtures from '../__fixtures__';

const { setup, skipTest, initTrezorConnect, Controller, TrezorConnect } = global.Trezor;

let controller;
let currentMnemonic;

describe(`TrezorConnect methods`, () => {
    afterAll(done => {
        // reset controller at the end
        if (controller) {
            controller.dispose();
            controller = undefined;
        }
        // global.WsCacheServer is assigned in jest.setup.js
        if (global.WsCacheServer) {
            global.WsCacheServer.close();
        }
        done();
    });

    fixtures.forEach(testCase => {
        describe(`TrezorConnect.${testCase.method}`, () => {
            beforeAll(async done => {
                try {
                    if (!controller) {
                        controller = new Controller({
                            url: 'ws://localhost:9001/',
                            name: testCase.method,
                        });
                        controller.on('error', error => {
                            controller = undefined;
                            console.log('Controller WS error', error);
                        });
                        controller.on('disconnect', () => {
                            controller = undefined;
                            console.log('Controller WS disconnected');
                        });
                    }

                    if (testCase.setup.mnemonic && testCase.setup.mnemonic !== currentMnemonic) {
                        await setup(controller, testCase.setup);
                        currentMnemonic = testCase.setup.mnemonic;
                    }

                    await initTrezorConnect(controller);
                    const res = await TrezorConnect.getFeatures();
                    console.log('Setup finished. Running tests against device: ', res);
                    done();
                } catch (error) {
                    console.log('Controller WS init error', error);
                    done(error);
                }
            }, 40000);

            afterAll(done => {
                TrezorConnect.dispose();
                done();
            });

            testCase.tests.forEach(t => {
                // check if test should be skipped on current configuration
                const testMethod = skipTest(t.skip) ? it.skip : it;
                testMethod(
                    t.description,
                    async done => {
                        if (!controller) {
                            done('Controller not found');
                            return;
                        }

                        // print current test case, `jest` default reporter doesn't log this. see https://github.com/facebook/jest/issues/4471
                        if (typeof jest !== 'undefined' && process.stderr) {
                            const log = chalk.black.bgYellow.bold(` ${testCase.method}: `);
                            process.stderr.write(`\n${log} ${chalk.bold(t.description)}\n`);
                        }

                        if (t.mnemonic && t.mnemonic !== currentMnemonic) {
                            // single test requires different seed, switch it
                            await setup(controller, { mnemonic: t.mnemonic });
                            currentMnemonic = t.mnemonic;
                        } else if (!t.mnemonic && testCase.setup.mnemonic !== currentMnemonic) {
                            // restore testCase.setup
                            await setup(controller, testCase.setup);
                            currentMnemonic = testCase.setup.mnemonic;
                        }

                        controller.options.name = t.description;
                        const result = await TrezorConnect[testCase.method](t.params);
                        let expected = t.result
                            ? { success: true, payload: t.result }
                            : { success: false };

                        // find legacy result
                        if (t.legacyResults) {
                            t.legacyResults.forEach(r => {
                                if (skipTest(r.rules)) {
                                    expected = r.payload
                                        ? { success: true, payload: r.payload }
                                        : { success: false };
                                }
                            });
                        }

                        expect(result).toMatchObject(expected);
                        done();
                    },
                    t.customTimeout || 20000,
                );
            });
        });
    });
});
