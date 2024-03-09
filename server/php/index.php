<?php

// Utility functions

function loadFile($url, $destination = false, $expiry = false)
{
    global $memoryCache;

    if (isset($memoryCache[$url])) {
        if ($expiry && $memoryCache[$url]['expiry'] < time()) {
            unset($memoryCache[$url]);
        } else {
            return $memoryCache[$url]['data'];
        }
    }

    if (substr($url, 0, 4) !== "http") {
        if (!file_exists($url)) {
            return false;
        }

        if ($expiry && $expiry > filemtime($url)) {
            return false;
        }
    }

    $file = @file_get_contents($url);
    if ($file === false) {
        return false;
    }

    if (!$destination) {
        try {
            $memoryCache[$url] = [
                'expiry' => $expiry ? time() + $expiry : false,
                'data' => json_decode($file, true),
            ];
            return $memoryCache[$url]['data'];
        } catch (Exception $exception) {
            return false;
        }
    }

    $directory = dirname($destination);
    if (!file_exists($directory)) {
        mkdir($directory, 0777, true);
    }

    if (file_put_contents($destination, $file) !== false) {
        try {
            $memoryCache[$url] = [
                'expiry' => $expiry ? time() + $expiry : false,
                'data' => json_decode($file, true),
            ];
            return $memoryCache[$url]['data'];
        } catch (Exception $exception) {
        }
    }

    return false;
}

function parseDetail($parts)
{
    if (count($parts) !== 3 || empty($parts[0]) || empty($parts[1]) ) {
        return false;
    }

    switch ($parts[1]) {
        case 'states':
        case 'cities':
        case 'districts':
        case 'counties':
        case 'neighbourhoods':
        case 'streets':
        case 'buildings':
            break;
        default:
            return false;
    }

    $id = $parts[2];
    if (substr($id, -5) !== '.json') {
        return false;
    }

    $numeric_part = substr($id, 0, -5);
    if (!is_numeric($numeric_part)) {
        return false;
    }
    return [
        $parts[0],
        $parts[1],
        $numeric_part
    ];
}

function parseList($parts)
{
    $path = implode('/', $parts);
    if (strlen($path) < 6 || substr($path, -5) !== '.json') {
        return false;
    }

    return $path;
}

function parsePath($path) {
    $parts = explode('/', strtolower($path));
    $category = array_shift($parts);

    switch ($category) {
        default:
            return false;
        case 'detail':
            return [$category, parseDetail($parts)];
        case 'list':
            return [$category, parseList($parts)];
    }
}

function responseJson($data)
{
    http_response_code(200);
    header('Content-Type: application/json');
    exit(json_encode($data));
}

function responseDetail($parsedPath, $baseUrl)
{
    list($country, $subject, $id) = $parsedPath;

    $indexFilePath = "./iadb/$country/$subject/index.json";
    $indexFileUrl = "$baseUrl/$country/$subject/index.json";
    $indexFileData = loadFile($indexFilePath, false, time() - 86400);

    if (!$indexFileData) {
        $indexFileData = loadFile($indexFileUrl, $indexFilePath);
        if (!$indexFileData) {
            http_response_code(404);
            exit("404 Not found");
        }
    }

    $definition = null;

    foreach ($indexFileData as $entry) {
        if ($id >= $entry['min'] && $id <= $entry['max']) {
            $definition = $entry;
            break;
        }
    }

    if (!$definition) {
        http_response_code(404);
        exit("404 Not found");
    }

    $batchFileName = $definition['fileName'];
    $batchFileTime = $definition['lastUpdate'];
    $batchFilePath = "./iadb/$country/$subject/$batchFileName";
    $batchFileUrl = "$baseUrl/$country/$subject/$batchFileName";
    $batchFileData = loadFile($batchFilePath, false, $batchFileTime);

    if (!$batchFileData) {
        $batchFileData = loadFile($batchFileUrl, $batchFilePath);
        if (!$batchFileData) {
            http_response_code(404);
            exit("404 Not found");
        }
    }

    if (!array_key_exists($id, $batchFileData)) {
        http_response_code(404);
        exit("404 Not found");
    }

    responseJson($batchFileData[$id]);
}

function responseList($path, $baseUrl)
{
    $filePath = "./iadb-list/$path";
    $fileUrl = "$baseUrl/$path";
    $fileData = loadFile($filePath, false, time() - 86400);

    if (!$fileData) {
        $fileData = loadFile($fileUrl, $filePath);
    }

    if (!$fileData) {
        http_response_code(404);
        exit("404 Not found");
    }

    responseJson($fileData);
}

// Request handler

$baseUrl = "https://github.com/zebraelectronics-cloud/iadb/raw/main/data";

$path = trim(isset($_GET['path']) ? $_GET['path'] : '', '/');

$parsedPathWithCategory = parsePath($path);

if (!$parsedPathWithCategory || !$parsedPathWithCategory[1]) {
    http_response_code(404);
    exit("404 Not found");
}

switch ($parsedPathWithCategory[0]) {
    case 'detail':
        responseDetail($parsedPathWithCategory[1], $baseUrl);
        break;
    case 'list':
        responseList($parsedPathWithCategory[1], $baseUrl);
        break;
    default:
        http_response_code(404);
        exit("404 Not found");
}
