import * as sinon from 'sinon';
import * as core from '@actions/core';
import * as runner from '../src/runner';
import * as fs from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import * as pt from 'path'
import * as types from "../src/types";
import * as cp from 'child_process';
import {fail} from 'should';
import {messagesFormatter} from "../src/messages";

describe('parasoft-coverage-action/runner', () => {
    const sandbox = sinon.createSandbox();
    let testRunner: any;
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
        testRunner = new runner.CoverageParserRunner() as any;
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('run()', () => {
        it('should reject when parasoft reports not found', async () => {
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns([]));

            await testRunner.run(customOption).catch((error) => {
                error.should.equal('Parasoft coverage XML report not found. No files matched the specified minimatch pattern or path: ' + customOption.report);
            });
        });

        it('should exit with -1 when java file not found', async () => {
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns(undefined));

            const res = await testRunner.run(customOption);

            res.exitCode.should.equal(-1);
        });

        it('should exit with non zero code when converting parasoft report failed', async () => {
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns('path/to/java'));
            sandbox.replace(testRunner, 'convertReportsWithJava', sandbox.fake.returns({ exitCode: -1 }));

            const res = await testRunner.run(customOption)

            res.exitCode.should.equal(-1);
        });

        it('should exit with -1 when merging reports failed', async () => {
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns('path/to/java'));
            sandbox.replace(testRunner, 'convertReportsWithJava', sandbox.fake.returns(Promise.resolve({ exitCode: 0, convertedCoberturaReportPaths: []})));

            const res = await testRunner.run(customOption)

            res.exitCode.should.equal(-1);
        });

        it('should exit 0 when parser parasoft report successfully', async () => {
            sandbox.replace(testRunner, 'findParasoftCoverageReports', sandbox.fake.returns('reports/coverage.xml'));
            sandbox.replace(testRunner, 'getJavaFilePath', sandbox.fake.returns('path/to/java'));
            sandbox.replace(testRunner, 'convertReportsWithJava', sandbox.fake.returns(Promise.resolve({ exitCode: 0, convertedCoberturaReportPaths: []})));
            sandbox.replace(testRunner, 'mergeCoberturaReports', sandbox.fake.returns({}));
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

        it('should throw the error when finding reports with a error', async () => {
            const globSyncStub = sinon.stub(glob, 'sync');
            globSyncStub.throws(new Error('finding reports error'));

            try {
                const res = await testRunner.findParasoftCoverageReports(__dirname);
                fail("Test failed", res);
            } catch (error: any) {
                error.message.should.equal('finding reports error');
            }
            globSyncStub.restore();
        });

        it('should return a empty array when report not exist', async () => {
            const res = await testRunner.findParasoftCoverageReports('notExist.xml');
            res.length.should.equal(0);
        });

        it('should print warning message when report path is a directory path', async () => {
            const globSyncStub = sinon.stub(glob, 'sync');
            globSyncStub.returns(['path/to/report']);
            const res = await testRunner.findParasoftCoverageReports('path/to/report');

            sinon.assert.calledWith(coreWarning, 'Skipping unrecognized report file: path/to/report');
            res.length.should.equal(0);
            globSyncStub.restore();
        });

        it('should print warning message when report is not a coverage report', async () => {
            const testReport = pt.join(__dirname, 'resources/reports/coverage_incorrect.xml');
            const res = await testRunner.findParasoftCoverageReports(testReport);

            sinon.assert.calledWith(coreWarning, 'Skipping unrecognized report file: ' + testReport);
            res.length.should.equal(0);
        });

        it('should return the report paths when found multiple reports', async () => {
            const reportPath = pt.join(__dirname, "resources/reports/coverage*");
            const expectedReportPaths = [
                pt.join(__dirname, "resources/reports/coverage_test.xml"),
                pt.join(__dirname, "resources/reports/coverage.xml"),
            ];

            const res = await testRunner.findParasoftCoverageReports(reportPath);
            sinon.assert.calledWith(coreInfo, messagesFormatter.format('Found Parasoft coverage XML report: {0}', expectedReportPaths[0]));
            sinon.assert.calledWith(coreInfo, messagesFormatter.format('Found Parasoft coverage XML report: {0}', expectedReportPaths[1]));
            res.length.should.equal(2);
            res.should.eql(expectedReportPaths);
        });

        it('should return a report path when found only one report', async () => {
            const expectedReportPath = pt.join(__dirname, "resources/reports/coverage.xml");
            const res = await testRunner.findParasoftCoverageReports('./resources/reports/coverage.xml');

            sinon.assert.calledWith(coreInfo, messagesFormatter.format('Found Parasoft coverage XML report: {0}', expectedReportPath));
            res.length.should.equal(1);
            res[0].should.equal(expectedReportPath);
        });
    });

    describe('getJavaFilePath()', () => {
        it('should return undefined when java installation directory does not exist', () => {
            process.env.JAVA_HOME = 'install/dir/does/not/exist';
            const res = testRunner.getJavaFilePath();

            sinon.assert.calledWith(coreWarning, 'Unable to process the XML report using Java because the Java or Parasoft tool installation directory is missing');
            if (res) {
                fail('res should be undefined', res);
            }
        });

        it('should return undefined when no java found in installation directory', () => {
            const fakeExistsSync = sandbox.fake.returns(true);
            sandbox.replace(fs, 'existsSync', fakeExistsSync);
            sandbox.replace(testRunner, 'doGetJavaFilePath', sandbox.fake.returns(undefined));

            const res = testRunner.getJavaFilePath(__dirname);

            sinon.assert.calledWith(coreWarning,'Unable to process the XML report using Java because it is missing')
            if (res) {
                fail('res should be undefined', res);
            }
        });

        it('should return java path when java found in installation directory', () => {
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
            const res = testRunner.doGetJavaFilePath(__dirname);

            if (res) {
                fail('res should be undefined', res);
            }
        });

        it('should return path when java found in in installation directory', () => {
            const fakeExistsSync = sandbox.fake.returns(true);
            sandbox.replace(fs, 'existsSync', fakeExistsSync);

            const res = testRunner.doGetJavaFilePath(__dirname);

            sinon.assert.calledWith(fakeExistsSync, pt.join(__dirname, 'bin', os.platform() == 'win32' ? "java.exe" : "java"));
            res.should.not.be.undefined();
        });
    });

    describe('convertReportsWithJava()', () => {
        it('should exit with non zero code when convert parasoft report failed', async () => {
            const testReport = pt.join(__dirname, 'resources/reports/coverage.xml');
            const res = await testRunner.convertReportsWithJava('path/to/java', [testReport]);

            res.exitCode.should.not.equal(0);
        });

        it('should return converted cobertura report paths when convert parasoft report successfully', async () => {
            const testReport = pt.join(__dirname, 'resources/reports/coverage.xml');
            const expectedReport = pt.join(__dirname, 'resources/reports/coverage-cobertura.xml');
            let handleProcessStub: any;

            // Use Sinon to mock childProcess.spawn
            // @ts-expect-error: Here is missing some properties from type, but they are not used in runner.ts
            const spawnStub = sinon.stub(cp, 'spawn').callsFake(() => {
                const mockProcess = {
                    stdout: { on: () => {} },
                    stderr: { on: () => {} },
                    on: (event: string, callback: (arg0: number) => void) => {
                        if (event === 'close') {
                            callback(0);
                        }
                    }
                };

                handleProcessStub = sinon.stub(testRunner, 'handleProcess').callsFake((process, resolve: any) => {
                    const mockRunDetails = { exitCode: 0 };
                    resolve(mockRunDetails);
                });

                return mockProcess;
            });

            const res = await testRunner.convertReportsWithJava('path/to/java', [testReport]);

            sinon.assert.calledWith(coreInfo, 'Cobertura report generated successfully: ' + expectedReport);
            res.exitCode.should.equal(0);
            res.convertedCoberturaReportPaths.length.should.equal(1);
            res.convertedCoberturaReportPaths[0].should.equal(expectedReport);

            spawnStub.restore();
            handleProcessStub.restore();
        });
    });

    describe('mergeCoberturaReports()', () => {
        const coberturaReportPathForTest = pt.join(__dirname, 'resources/reports/cobertura');
        beforeEach(() => {
            process.env.GITHUB_WORKSPACE = __dirname;
        });

        it('should return undefined when no cobertura reports', () => {
            const res = testRunner.mergeCoberturaReports([]);

            if (res) {
                fail('res should be undefined', res);
            }
        });

        it('should print warning message when throw a error during merging reports', () => {
            const reportPaths = [pt.join(coberturaReportPathForTest, "coverage-cobertura.xml"), pt.join(coberturaReportPathForTest, "coverage-cobertura_invalid.xml")];
            testRunner.mergeCoberturaReports(reportPaths);

            sinon.assert.calledWith(coreWarning, messagesFormatter.format("Coverage data in report ''{0}'' was not merged due to An inconsistent set of lines reported for file ''src/main/java/com/parasoft/Demo.java''", reportPaths[1]));
        });

        describe('should return merged cobertura report data', () => {
            it('when merging reports without multiple modules', () => {
                const expectedCoverage = {
                    lineRate: 1,
                    linesCovered: 5,
                    linesValid: 5,
                    version: 'Jtest 2022.2.0',
                    packages: new Map<string, types.CoberturaPackage>([
                        [
                            'com.parasoft', {
                                name: 'com.parasoft',
                                lineRate: 1,
                                classes: new Map<string, types.CoberturaClass>([
                                    [
                                        'com.parasoft.Demo-src/main/java/com/parasoft/Demo.java', {
                                        classId: 'com.parasoft.Demo-src/main/java/com/parasoft/Demo.java',
                                        fileName: 'src/main/java/com/parasoft/Demo.java',
                                        name: 'com.parasoft.Demo',
                                        lineRate: 1,
                                        coveredLines: 3,
                                        lines: [
                                            { lineNumber: 3, lineHash: '-1788429923', hits: 1 },
                                            { lineNumber: 6, lineHash: '380126011', hits: 2 },
                                            { lineNumber: 12, lineHash: '-895699689', hits: 1 }
                                        ]
                                    }
                                    ], [
                                        'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java', {
                                            classId: 'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java',
                                            fileName: 'src/main/java/com/parasoft/Demo.java',
                                            name: 'com.parasoft.Demo#1',
                                            lineRate: 1,
                                            coveredLines: 2,
                                            lines: [
                                                { lineNumber: 6, lineHash: '380126011', hits: 2 },
                                                { lineNumber: 9, lineHash: '1606603515', hits: 1 }
                                            ]
                                        }
                                    ]
                                ])
                            }
                        ]
                    ])
                }
                const reportPaths = [pt.join(coberturaReportPathForTest, "coverage-cobertura.xml"), pt.join(coberturaReportPathForTest, "coverage-cobertura_merge.xml")];

                const res = testRunner.mergeCoberturaReports(reportPaths);
                res.should.eql(expectedCoverage);
            });

            it('when merging reports with multiple modules', () => {
                const expectedCoverage = {
                    lineRate: 0.8181818181818182,
                    linesCovered: 9,
                    linesValid: 11,
                    version: 'Jtest 2022.2.0',
                    packages: new Map<string, types.CoberturaPackage>([
                        [
                            'com.parasoft', {
                            name: 'com.parasoft',
                            lineRate: 1,
                            classes: new Map<string, types.CoberturaClass>([
                                [
                                    'com.parasoft.Demo-src/main/java/com/parasoft/Demo.java', {
                                    classId: 'com.parasoft.Demo-src/main/java/com/parasoft/Demo.java',
                                    fileName: 'src/main/java/com/parasoft/Demo.java',
                                    name: 'com.parasoft.Demo',
                                    lineRate: 1,
                                    coveredLines: 3,
                                    lines: [
                                        { lineNumber: 3, lineHash: '-1788429923', hits: 1 },
                                        { lineNumber: 6, lineHash: '380126011', hits: 2 },
                                        { lineNumber: 12, lineHash: '-895699689', hits: 1 }
                                    ]
                                }
                                ], [
                                    'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java', {
                                        classId: 'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java',
                                        fileName: 'src/main/java/com/parasoft/Demo.java',
                                        name: 'com.parasoft.Demo#1',
                                        lineRate: 1,
                                        coveredLines: 2,
                                        lines: [
                                            { lineNumber: 6, lineHash: '380126011', hits: 2 },
                                            { lineNumber: 9, lineHash: '1606603515', hits: 1 }
                                        ]
                                    }
                                ]
                            ])
                        }], ['com.example', {
                            name: 'com.example',
                            lineRate: 0.6666666666666666,
                            classes: new Map<string, types.CoberturaClass>([
                                [
                                    'com.example.AppA-C:/test/module-a/src/main/java/com/example/AppA.java', {
                                        classId: 'com.example.AppA-C:/test/module-a/src/main/java/com/example/AppA.java',
                                        fileName: 'C:/test/module-a/src/main/java/com/example/AppA.java',
                                        name: 'com.example.AppA',
                                        lineRate: 0.6666666666666666,
                                        coveredLines: 2,
                                    lines: [
                                        { lineNumber: 3, lineHash: '1723197983', hits: 0 },
                                        { lineNumber: 7, lineHash: '-1390516089', hits: 1 },
                                        { lineNumber: 8, lineHash: '30537853', hits: 1 }
                                    ]
                                }], [
                                    'com.example.AppB-C:/test/module-b/src/main/java/com/example/AppB.java', {
                                        classId: 'com.example.AppB-C:/test/module-b/src/main/java/com/example/AppB.java',
                                        fileName: 'C:/test/module-b/src/main/java/com/example/AppB.java',
                                        name: 'com.example.AppB',
                                        lineRate: 0.6666666666666666,
                                        coveredLines: 2,
                                        lines: [
                                            { lineNumber: 3, lineHash: '1723197984', hits: 0 },
                                            { lineNumber: 7, lineHash: '-1390516089', hits: 1 },
                                            { lineNumber: 8, lineHash: '30537853', hits: 1 }
                                        ]
                                    }
                                ]
                            ])
                        }]
                    ])
                }
                const reportPaths = [pt.join(coberturaReportPathForTest, "coverage-cobertura.xml"), pt.join(coberturaReportPathForTest, "coverage-cobertura_multiple_modules.xml")];

                const res = testRunner.mergeCoberturaReports(reportPaths);
                res.should.eql(expectedCoverage);
            });

            it('when packages not found in base report', () => {
                const expectedCoverage = {
                    lineRate: 0,
                    linesCovered: 0,
                    linesValid: 2,
                    version: 'Jtest 2022.2.0',
                    packages: new Map<string, types.CoberturaPackage>([
                        [
                            'com.parasoft', {
                                name: 'com.parasoft',
                                lineRate: 0,
                                classes: new Map<string, types.CoberturaClass>([
                                    [
                                        'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java', {
                                            classId: 'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java',
                                            fileName: 'src/main/java/com/parasoft/Demo.java',
                                            name: 'com.parasoft.Demo#1',
                                            lineRate: 0,
                                            coveredLines: 0,
                                            lines: [
                                                { lineNumber: 6, lineHash: '380126011', hits: 0 },
                                                { lineNumber: 9, lineHash: '1606603515', hits: 0 }
                                            ]
                                        }
                                    ]
                                ])
                            }
                        ]
                    ])
                }
                const reportPaths = [pt.join(coberturaReportPathForTest, "coverage-cobertura_lack_package.xml"), pt.join(coberturaReportPathForTest, "coverage-cobertura_merge.xml")];

                const res = testRunner.mergeCoberturaReports(reportPaths);
                res.should.eql(expectedCoverage);
            });

            it('when classes not found in base report', () => {
                const expectedCoverage = {
                    lineRate: 0,
                    linesCovered: 0,
                    linesValid: 2,
                    version: 'Jtest 2022.2.0',
                    packages: new Map<string, types.CoberturaPackage>([
                        [
                            'com.parasoft', {
                                name: 'com.parasoft',
                                lineRate: 0,
                                classes: new Map<string, types.CoberturaClass>([
                                    [
                                        'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java', {
                                            classId: 'com.parasoft.Demo#1-src/main/java/com/parasoft/Demo.java',
                                            fileName: 'src/main/java/com/parasoft/Demo.java',
                                            name: 'com.parasoft.Demo#1',
                                            lineRate: 0,
                                            coveredLines: 0,
                                            lines: [
                                                { lineNumber: 6, lineHash: '380126011', hits: 0 },
                                                { lineNumber: 9, lineHash: '1606603515', hits: 0 }
                                            ]
                                        }
                                    ]
                                ])
                            }
                        ]
                    ])
                }
                const reportPaths = [pt.join(coberturaReportPathForTest, "coverage-cobertura_lack_class.xml"), pt.join(coberturaReportPathForTest, "coverage-cobertura_merge.xml")];

                const res = testRunner.mergeCoberturaReports(reportPaths);
                res.should.eql(expectedCoverage);
            });
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

        await testRunner.generateCoverageSummary(coberturaCoverageDataForTest);
        sinon.assert.calledOnce(fakeSummaryWrite);
    });
});