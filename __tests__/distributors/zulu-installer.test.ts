import { HttpClient } from '@actions/http-client';
import * as semver from 'semver';
import { ZuluDistribution } from '../../src/distributions/zulu/installer';
import { IZuluVersions } from '../../src/distributions/zulu/models';
import * as utils from '../../src/util';

const manifestData = require('../data/zulu-releases-default.json') as [];

describe('getAvailableVersions', () => {
  let spyHttpClient: jest.SpyInstance;
  let spyUtilGetDownloadArchiveExtension: jest.SpyInstance;

  beforeEach(() => {
    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockReturnValue({
      statusCode: 200,
      headers: {},
      result: manifestData as IZuluVersions[]
    });

    spyUtilGetDownloadArchiveExtension = jest.spyOn(utils, 'getDownloadArchiveExtension');
    spyUtilGetDownloadArchiveExtension.mockReturnValue('tar.gz');
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it.each([
    [
      { version: '11', arch: 'x86', packageType: 'jdk' },
      '?os=macos&ext=tar.gz&bundle_type=jdk&javafx=false&arch=x86&hw_bitness=32&release_status=ga'
    ],
    [
      { version: '11-ea', arch: 'x86', packageType: 'jdk' },
      '?os=macos&ext=tar.gz&bundle_type=jdk&javafx=false&arch=x86&hw_bitness=32&release_status=ea'
    ],
    [
      { version: '8', arch: 'x64', packageType: 'jdk' },
      '?os=macos&ext=tar.gz&bundle_type=jdk&javafx=false&arch=x86&hw_bitness=64&release_status=ga'
    ],
    [
      { version: '8', arch: 'x64', packageType: 'jre' },
      '?os=macos&ext=tar.gz&bundle_type=jre&javafx=false&arch=x86&hw_bitness=64&release_status=ga'
    ],
    [
      { version: '8', arch: 'x64', packageType: 'jdk+fx' },
      '?os=macos&ext=tar.gz&bundle_type=jdk&javafx=true&arch=x86&hw_bitness=64&release_status=ga&features=fx'
    ],
    [
      { version: '8', arch: 'x64', packageType: 'jre+fx' },
      '?os=macos&ext=tar.gz&bundle_type=jre&javafx=true&arch=x86&hw_bitness=64&release_status=ga&features=fx'
    ]
  ])('build correct url for %s -> %s', async (input, parsedUrl) => {
    const distribution = new ZuluDistribution(input);
    distribution['getPlatformOption'] = () => 'macos';
    const buildUrl = `https://api.azul.com/zulu/download/community/v1.0/bundles/${parsedUrl}`;

    await distribution['getAvailableVersions']();

    expect(spyHttpClient.mock.calls).toHaveLength(1);
    expect(spyHttpClient.mock.calls[0][0]).toBe(buildUrl);
  });

  it('load available versions', async () => {
    const distribution = new ZuluDistribution({ version: '11', arch: 'x86', packageType: 'jdk' });
    const availableVersions = await distribution['getAvailableVersions']();
    expect(availableVersions).toHaveLength(manifestData.length);
  });
});

describe('getArchitectureOptions', () => {
  it.each([
    [{ architecture: 'x64' }, { arch: 'x86', hw_bitness: '64', abi: '' }],
    [{ architecture: 'x86' }, { arch: 'x86', hw_bitness: '32', abi: '' }],
    [{ architecture: 'x32' }, { arch: 'x32', hw_bitness: '', abi: '' }],
    [{ architecture: 'arm' }, { arch: 'arm', hw_bitness: '', abi: '' }]
  ])('%s -> %s', (input, expected) => {
    const distribution = new ZuluDistribution({
      version: '11',
      arch: input.architecture,
      packageType: 'jdk'
    });
    expect(distribution['getArchitectureOptions']()).toEqual(expected);
  });
});

describe('findPackageForDownload', () => {
  it.each([
    ['8', '8.0.282+8'],
    ['11.x', '11.0.10+9'],
    ['8.0', '8.0.282+8'],
    ['11.0.x', '11.0.10+9'],
    ['15', '15.0.2+7'],
    ['9.0.0', '9.0.0+0'],
    ['9.0', '9.0.1+0'],
    ['8.0.262', '8.0.262+19'] // validate correct choise between [8.0.262.17, 8.0.262.19, 8.0.262.18]
  ])('version is %s -> %s', async (input, expected) => {
    const distribution = new ZuluDistribution({
      version: input,
      arch: 'x86',
      packageType: 'jdk'
    });
    distribution['getAvailableVersions'] = async () => manifestData;
    const result = await distribution['findPackageForDownload'](distribution['version']);
    expect(result.version).toBe(expected);
  });

  it('select correct bundle if there are multiple items with the same jdk version but different zulu versions', async () => {
    const distribution = new ZuluDistribution({ version: '', arch: 'x86', packageType: 'jdk' });
    distribution['getAvailableVersions'] = async () => manifestData;
    const result = await distribution['findPackageForDownload'](new semver.Range('11.0.5'));
    expect(result.url).toBe(
      'https://cdn.azul.com/zulu/bin/zulu11.35.15-ca-jdk11.0.5-macosx_x64.tar.gz'
    );
  });

  it('should throw an error', async () => {
    const distribution = new ZuluDistribution({ version: '18', arch: 'x86', packageType: 'jdk' });
    await expect(
      distribution['findPackageForDownload'](distribution['version'])
    ).rejects.toThrowError(/Could not find satisfied version for semver */);
  });
});

describe('convertVersionToSemver', () => {
  it.each([
    [[12], '12'],
    [[12, 0], '12.0'],
    [[12, 0, 2], '12.0.2'],
    [[12, 0, 2, 1], '12.0.2+1'],
    [[12, 0, 2, 1, 3], '12.0.2+1']
  ])('%s -> %s', (input: number[], expected: string) => {
    const distribution = new ZuluDistribution({ version: '18', arch: 'x86', packageType: 'jdk' });
    const actual = distribution['convertVersionToSemver'](input);
    expect(actual).toBe(expected);
  });
});
