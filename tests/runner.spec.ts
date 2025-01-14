import * as sinon from 'sinon';
import * as core from '@actions/core';
import * as runner from '../src/runner';
import * as fs from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import * as pt from 'path'
import * as types from "../src/types";
import * as cp from 'child_process';
import { fail } from 'should';

describe('parasoft-coverage-action/runner', () => {
    const sandbox = sinon.createSandbox();
    let coreSetFailed : sinon.SinonSpy;
    let coreInfo : sinon.SinonSpy;
    let coreError : sinon.SinonSpy;
    let coreWarning : sinon.SinonSpy;
    let coreDebug : sinon.SinonSpy;
    let customOption : runner.RunOptions

    beforeEach(() => {
        coreSetFailed = sandbox.fake();
        sandbox.replace(core, 'setFailed', coreSetFailed);
        coreInfo = sandbox.fake();
        sandbox.replace(core, 'info', coreInfo);
        coreError = sandbox.fake();
        sandbox.replace(core, 'error', coreError);
        coreWarning = sandbox.fake();
        sandbox.replace(core, 'warning', coreWarning);
        coreDebug = sandbox.fake();
        sandbox.replace(core, 'debug', coreDebug);
        customOption = {
            report: "**/coverage.xml",
            parasoftToolOrJavaRootPath: "C:/Java",
        }
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('run()', () => {
        it('should reject when parasoft reports not found', async () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns([]));

            await testRunner.run(customOption).catch((error) => {
                error.should.equal('Parasoft coverage XML report not found at the specified location: ' + customOption.report);
            });
        });

        it('should exit with -1 when java file not found', async () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns(undefined));

            const res = await testRunner.run(customOption);

            res.exitCode.should.equal(-1);
        });

        it('should exit with non zero code when convert parasoft report failed', async () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns('path/to/java'));
            sandbox.replace(testRunner, 'convertReportsWithJava', sandbox.fake.returns({ exitCode: -1 }));

            const res = await testRunner.run(customOption)

            res.exitCode.should.equal(-1);
        });

        it('should exit 0 when parser parasoft report successfully', async () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns('path/to/java'));
            sandbox.replace(testRunner, 'convertReportsWithJava', sandbox.fake.returns(Promise.resolve({ exitCode: 0, convertedCoberturaReportPaths: []})));
            sandbox.replace(testRunner, 'generateCoverageSummary', sandbox.fake.returns(null)); // Use 'null' to indicate no return value
            sandbox.replace(fs, 'existsSync', sandbox.fake.returns(true));

            const res = await testRunner.run(customOption);
            res.exitCode.should.equal(0);
        });
    });

    describe('findParasoftCoverageReports()', () => {
        beforeEach(() => {
            process.env.GITHUB_WORKSPACE = __dirname;
        });

        it('should throw the error when finding reports with a error', () => {
            const globSyncStub = sinon.stub(glob, 'sync');
            globSyncStub.throws(new Error('finding reports error'));
            const testRunner = new runner.CoverageParserRunner() as any;

            try {
                const res = testRunner.findParasoftCoverageReports(__dirname);
                fail("Test failed", res);
            } catch (error: any) {
                error.message.should.equal('finding reports error');
            }
            globSyncStub.restore();
        });

        it('should return a empty array when report not exist', () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            const res = testRunner.findParasoftCoverageReports('notExist.xml');

            res.length.should.equal(0);
        });

        it('should return the report paths when found multiple reports', () => {
            const reportPath = pt.join(__dirname, "/resources/reports/coverage*");
            const expectedReportPaths = [pt.join(__dirname, "/resources/reports/coverage_incorrect.xml"), pt.join(__dirname, "/resources/reports/coverage.xml")];

            const testRunner = new runner.CoverageParserRunner() as any;
            const res = testRunner.findParasoftCoverageReports(reportPath);

            sinon.assert.calledWith(coreInfo, 'Found 2 matching files:');
            sinon.assert.calledWith(coreInfo, '\t' + expectedReportPaths[0]);
            sinon.assert.calledWith(coreInfo, '\t' + expectedReportPaths[1]);
            res.length.should.equal(2);
            res.should.eql(expectedReportPaths);
        });

        it('should return a report path when found only one report', () => {
            const expectedReportPath = pt.join(__dirname, "/resources/reports/coverage.xml");
            const testRunner = new runner.CoverageParserRunner() as any;
            const res = testRunner.findParasoftCoverageReports('./resources/reports/coverage.xml');

            sinon.assert.calledWith(coreInfo, 'Found a matching file: ' + expectedReportPath);
            res.length.should.equal(1);
            res[0].should.equal(expectedReportPath);
        });
    });

    describe('getJavaFilePath()', () => {
        it('should return undefined when java installation directory does not exist', () => {
            process.env.JAVA_HOME = 'install/dir/does/not/exist';
            const testRunner = new runner.CoverageParserRunner() as any;
            const res = testRunner.getJavaFilePath();

            sinon.assert.calledWith(coreWarning, 'Unable to process the XML report using Java because the Java or Parasoft tool installation directory is missing');
            if (res) {
                fail('res should be undefined', undefined);
            }
        });

        it('should return undefined when no java found in installation directory', () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            const fakeExistsSync = sandbox.fake.returns(true);
            sandbox.replace(fs, 'existsSync', fakeExistsSync);
            sandbox.replace(testRunner, 'doGetJavaFilePath', sandbox.fake.returns(undefined));

            const res = testRunner.getJavaFilePath(__dirname);

            sinon.assert.calledWith(coreWarning,'Unable to process the XML report using Java because it is missing')
            if (res) {
                fail('res should be undefined', undefined);
            }
        });

        it('should return java path when java found in installation directory', () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            const fakeExistsSync = sandbox.fake.returns(true);
            sandbox.replace(fs, 'existsSync', fakeExistsSync);
            sandbox.replace(testRunner, 'doGetJavaFilePath', sandbox.fake.returns('path/to/java/file'));

            const res = testRunner.getJavaFilePath(__dirname);

            sinon.assert.calledWith(coreDebug, 'Found Java located at: path/to/java/file');
            res.should.equal('path/to/java/file');
        });
    });

    describe('doGetJavaFilePath()', () => {
        it('should return undefined when no java found in installation directory found', () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            const res = testRunner.doGetJavaFilePath(__dirname);

            if (res) {
                fail('res should be undefined', undefined);
            }
        });

        it('should return path when java found in in installation directory', () => {
            const fakeExistsSync = sandbox.fake.returns(true);
            sandbox.replace(fs, 'existsSync', fakeExistsSync);

            const testRunner = new runner.CoverageParserRunner() as any;
            const res = testRunner.doGetJavaFilePath(__dirname);

            sinon.assert.calledWith(fakeExistsSync, pt.join(__dirname, 'bin', os.platform() == 'win32' ? "java.exe" : "java"));
            res.should.not.be.undefined();
        });
    });

    describe('convertReportsWithJava()', () => {
        it('should print warning message when report path is a directory path', async () => {
            const testRunner = new runner.CoverageParserRunner() as any;
            const res = await testRunner.convertReportsWithJava('path/to/java', ['path/to/report']);

            sinon.assert.calledWith(coreWarning, 'Skipping unrecognized report file: path/to/report');
            res.convertedCoberturaReportPaths.length.should.equal(0);
        });

        it('should print warning message when report is not a coverage report', async () => {
            const testReport = pt.join(__dirname, '/resources/reports/coverage_incorrect.xml');
            const testRunner = new runner.CoverageParserRunner() as any;
            await testRunner.convertReportsWithJava('path/to/java', [testReport]);

            sinon.assert.calledWith(coreWarning, 'Skipping unrecognized report file: ' + testReport);
        });

        it('should exit with non zero code when convert parasoft report failed', async () => {
            const testReport = pt.join(__dirname, '/resources/reports/coverage.xml');
            const testRunner = new runner.CoverageParserRunner() as any;
            const res = await testRunner.convertReportsWithJava('path/to/java', [testReport]);

            res.exitCode.should.not.equal(0);
        });

        it('should return converted cobertura report paths when convert parasoft report successfully', async () => {
            const testReport = pt.join(__dirname, '/resources/reports/coverage.xml');
            const expectedReport = pt.join(__dirname, '/resources/reports/coverage-cobertura.xml');
            let spawnStub;
            let handleProcessStub;

            // Use Sinon to mock childProcess.spawn
            // @ts-ignore: Here is missing some properties from type, but they are not used in runner.ts
            spawnStub = sinon.stub(cp, 'spawn').callsFake((commandLine, options) => {
                const mockProcess = {
                    stdout: { on: () => {} },
                    stderr: { on: () => {} },
                    on: (event: string, callback: (arg0: number) => void) => {
                        if (event === 'close') {
                            callback(0);
                        }
                    }
                };

                handleProcessStub = sinon.stub(testRunner, 'handleProcess').callsFake((process, resolve: any, reject) => {
                    const mockRunDetails = { exitCode: 0 };
                    resolve(mockRunDetails);
                });

                return mockProcess;
            });

            const testRunner = new runner.CoverageParserRunner() as any;
            const res = await testRunner.convertReportsWithJava('path/to/java', [testReport]);

            sinon.assert.calledWith(coreInfo, 'Cobertura report generated successfully: ' + expectedReport);
            res.exitCode.should.equal(0);
            res.convertedCoberturaReportPaths.length.should.equal(1);
            res.convertedCoberturaReportPaths[0].should.equal(expectedReport);

            spawnStub.restore();
            handleProcessStub.restore();
        });
    });

    it('generateCoverageSummary()', async () => {
        const coberturaCoverageDataForTest = {
            lineRate: 0.6667,
            linesCovered: 6,
            linesValid: 9,
            packages: new Map<string, types.CoberturaPackage>([
                [
                    'com.example.package', // Package name
                    {
                        name: 'com.example.package',
                        lineRate: 0.6667,
                        classes: new Map<string, types.CoberturaClass>([
                            [
                                'MyClass.java', // Class file name
                                {
                                    classId: 'MyClass.java|MyClass', // Combination of filename + class name
                                    fileName: 'MyClass.java',
                                    name: 'MyClass1',
                                    lineRate: 0.6667,
                                    coveredLines: 2,
                                    lines: [
                                        { lineNumber: 1, lineHash: 'abc123', hits: 1 },
                                        { lineNumber: 2, lineHash: 'def456', hits: 0 },
                                        { lineNumber: 3, lineHash: 'ghi789', hits: 1 },
                                    ]
                                }
                            ]
                        ])
                    }
                ]
            ])
        }

        const fakeSummaryWrite = sandbox.fake();
        sandbox.replace(core.summary, 'write', fakeSummaryWrite);

        const testRunner = new runner.CoverageParserRunner() as any;
        await testRunner.generateCoverageSummary(coberturaCoverageDataForTest);

        sinon.assert.calledOnce(fakeSummaryWrite);
    });
});