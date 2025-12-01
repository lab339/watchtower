import { DataChunks, series, facets } from '@adobe/rum-distiller';


function errorCount(bundle) {
  const errorEvents = bundle.events.filter(
    (event) => event.checkpoint === 'error' &&
    event.source !== 'focus-loss' &&
    event.source !== 'undefined error' &&
    !event.source?.includes('helix-rum-enhancer')
  );
  const hasUndefinedError = errorEvents.some(({source}) => source === 'undefined error');
  return errorEvents.length + (hasUndefinedError ? 1 : 0);
}

function isValidError(event) {
  return event.checkpoint === 'error' &&
    event.source !== 'focus-loss' &&
  !event.source?.includes('helix-rum-enhancer')
}

function errorSource(bundle) {
  return Array.from(bundle.events
    .filter(isValidError)
    .filter(({source}) => source)
    .reduce((acc, { source }) => {
        acc.add(source);
        return acc;
      }, new Set()))
}

function errorTarget(bundle) {
  return Array.from(bundle.events
    .filter(isValidError)
    .filter(({target}) => target)
    .reduce((acc, { target }) => {
        acc.add(target);
        return acc;
      }, new Set()))
}

function errorDetails(bundle) {
  return Array.from(bundle.events
    .filter(isValidError)
    .reduce((acc, { source,target }) => {
        acc.add(`${source} | ${target}`);
        return acc;
      }, new Set()))
}

function hour(bundle) {
  const utcDate = new Date(bundle.timeSlot);
  // Format as ISO string in local timezone (keeping only date and hour)
  const year = utcDate.getFullYear();
  const month = String(utcDate.getMonth() + 1).padStart(2, '0');
  const day = String(utcDate.getDate()).padStart(2, '0');
  const hour = String(utcDate.getHours()).padStart(2, '0');
  return [`${year}-${month}-${day}T${hour}:00:00`];
}

function missingresource(bundle) {
  return bundle.events
  .filter(e => e.checkpoint === 'missingresource')
  .filter(e => e.source && ['redacted', 'junk_email'].every(s => !e.source.toLowerCase().includes(s)))
  .map(e => e.source);
}

function loadresource(bundle) {
  return bundle.events
  .filter(e => e.checkpoint === 'loadresource')
  .filter(e => e.source && ['redacted', 'junk_email'].every(s => !e.source.toLowerCase().includes(s)))
  .map(e => e.source);
}

function normalizeSourceValue(src) {
  try {
    // Normalize http/https URLs to origin + pathname without trailing slash or hash
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const u = new URL(src);
      let path = (u.pathname || '/').replace(/\/+$/, '');
      // root path -> empty string for cleaner label
      if (path === '') path = '';
      return `${u.origin}${path}`;
    }
    // Strip trailing '/#' or '#' variants
    return src.replace(/\/?#$/, '');
  } catch (e) {
    // Fallback: return as-is
    return src;
  }
}

function enterSourceFacet(bundle) {
  return bundle.events
    .filter(e => e.checkpoint === 'enter')
    .filter(e => e.source && ['redacted', 'junk_email'].every(s => !e.source.toLowerCase().includes(s)))
    .map(e => normalizeSourceValue(e.source));
}

function errorDataChunks(data) {
  const dataChunks = new DataChunks();
  dataChunks.load(data);

  dataChunks.addSeries('pageViews', series.pageViews);
  dataChunks.addSeries('errorCount', errorCount, 'every');

  dataChunks.addFacet('errorSource', errorSource, 'every');
  dataChunks.addFacet('errorTarget', errorTarget, 'every');
  dataChunks.addFacet('errorDetails', errorDetails, 'every');
  dataChunks.addFacet('hour', hour, 'every');
  dataChunks.addFacet('userAgent', facets.userAgent);
  dataChunks.addFacet('missingresource', missingresource, 'every');
  return dataChunks;
}

function isFormLoadEvent(event) {
  return event.checkpoint === 'viewblock' && event.source.match(/form/);
}

function getFormLoadEvent(events) {
  return events.find(isFormLoadEvent);
}

function formBlockLoadTime(threshold) {
  return function time(bundle) {
    const sortedEvents = bundle.events.sort((a, b) => a.timeDelta - b.timeDelta);
    const formLoad = getFormLoadEvent(sortedEvents);
    if (threshold && formLoad?.timeDelta > threshold) {
      return undefined;
    }
    if (formLoad?.timeDelta > 0) {
      return formLoad?.timeDelta / 1000;
    }
    return undefined;
  }
}



function performanceDataChunks(data) {
  const dataChunks = new DataChunks();
  dataChunks.load(data);
  dataChunks.addSeries('pageViews', series.pageViews);
  dataChunks.addSeries('lcp', series.lcp);
  dataChunks.addSeries('formBlockLoadTime', formBlockLoadTime(2 * 60 * 1000));
  dataChunks.addFacet('formBlockLoadTime', (bundle) => {
    const getFormLoadTime = formBlockLoadTime()(bundle);
    if (getFormLoadTime) {
      return [`${getFormLoadTime}s`];
    }
    return undefined;
  });
  dataChunks.addSeries('formLoaded', b => b.events.find(isFormLoadEvent) ? b.weight : 0);
  dataChunks.addFacet('loadresource', loadresource, 'every');

  dataChunks.addFacet('hour', hour, 'every', 'none');
  dataChunks.addFacet('enterSource', enterSourceFacet, 'every', 'none');
  return dataChunks;
}

function engagementDataChunks(data) {
  const dataChunks = new DataChunks();
  dataChunks.load(data);
  dataChunks.addSeries('pageViews', series.pageViews);
  dataChunks.addFacet('hour', hour, 'every', 'none');
  dataChunks.addSeries('fills', b => b.events.find(e => e.checkpoint === 'fill') ? b.weight : 0);
  dataChunks.addSeries('clicks', b => b.events.find(e => e.checkpoint === 'click') ? b.weight : 0);
  dataChunks.addSeries('fillCount', b => b.events.filter(e => e.checkpoint === 'fill').length);
  dataChunks.addSeries('clickCount', b => b.events.filter(e => e.checkpoint === 'click').length);
  return dataChunks;
}

function resourceDataChunks(data) {
  const dataChunks = new DataChunks();
  dataChunks.load(data);
  dataChunks.addSeries('pageViews', series.pageViews);
  dataChunks.addFacet('hour', hour, 'every', 'none');
  dataChunks.addFacet('missingresource', missingresource, 'every');
  return dataChunks;
}

export { errorDataChunks, performanceDataChunks, engagementDataChunks, resourceDataChunks };