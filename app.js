let autoRefreshInterval;
const CANDIDATES_TO_SHOW = 5;
const MIN_PERCENT_FOR_BAR = 1.0;
const FETCH_TIMEOUT = 10000; // 10 second timeout

const RACE_ENDPOINTS = {
    // Federal - uses different subdomain and structure
    house14: [
        'https://dp.electionresults.sos.ca.gov/returns/us-rep/district/14',
        'https://api.sos.ca.gov/returns/us-rep/district/14'
    ],

    // Statewide
    governor: [
        'https://api.sos.ca.gov/returns/governor',
        'https://dp.electionresults.sos.ca.gov/returns/governor'
    ],
    ltGovernor: [
        'https://api.sos.ca.gov/returns/lieutenant-governor',
        'https://dp.electionresults.sos.ca.gov/returns/lieutenant-governor'
    ],
    secretary: [
        'https://api.sos.ca.gov/returns/secretary-of-state',
        'https://dp.electionresults.sos.ca.gov/returns/secretary-of-state'
    ],
    attorneyGeneral: [
        'https://api.sos.ca.gov/returns/attorney-general',
        'https://dp.electionresults.sos.ca.gov/returns/attorney-general'
    ],
    insurance: [
        'https://api.sos.ca.gov/returns/insurance-commissioner',
        'https://dp.electionresults.sos.ca.gov/returns/insurance-commissioner'
    ],
    controller: [
        'https://api.sos.ca.gov/returns/controller',
        'https://dp.electionresults.sos.ca.gov/returns/controller'
    ],
    treasurer: [
        'https://api.sos.ca.gov/returns/treasurer',
        'https://dp.electionresults.sos.ca.gov/returns/treasurer'
    ],
    superintendent: [
        'https://api.sos.ca.gov/returns/superintendent-of-public-instruction',
        'https://dp.electionresults.sos.ca.gov/returns/superintendent-of-public-instruction'
    ],
    equalization2: [
        'https://dp.electionresults.sos.ca.gov/returns/boe/district/2',
        'https://api.sos.ca.gov/returns/board-of-equalization/district/2'
    ],

    // Legislative
    senate10: [
        'https://dp.electionresults.sos.ca.gov/returns/state-senate/district/10',
        'https://api.sos.ca.gov/returns/state-senate/district/10'
    ],
    assembly20: [
        'https://dp.electionresults.sos.ca.gov/returns/state-assembly/district/20',
        'https://api.sos.ca.gov/returns/state-assembly/district/20'
    ]
};

function parseVotes(votesStr) {
    return parseInt(votesStr.replace(/,/g, ''), 10) || 0;
}

function parsePercent(percentStr) {
    return parseFloat(percentStr) || 0;
}

function estimateBallotsCounted(data, raceName) {
    const candidates = data.candidates || [];
    const totalVotesCounted = candidates.reduce((sum, c) => {
        return sum + parseVotes(c.Votes || '0');
    }, 0);

    let estimatedRegisteredVoters;
    let estimatedTurnout = 0.30;

    if (raceName && raceName.includes('House District')) {
        estimatedRegisteredVoters = 422557;
    } else if (raceName && raceName.includes('State Senate District')) {
        estimatedRegisteredVoters = 930000;
    } else if (raceName && raceName.includes('State Assembly District')) {
        estimatedRegisteredVoters = 465000;
    } else if (raceName && raceName.includes('Board of Equalization')) {
        estimatedRegisteredVoters = 5500000;
    } else {
        estimatedRegisteredVoters = 22000000;
    }

    const expectedTotalBallots = estimatedRegisteredVoters * estimatedTurnout;
    const percentCounted = (totalVotesCounted / expectedTotalBallots) * 100;

    return {
        totalVotesCounted,
        expectedTotalBallots,
        percentCounted: Math.min(percentCounted, 100),
        estimatedRegisteredVoters
    };
}

function renderBallotCountStatus(data, reportingTime, raceName) {
    const ballotInfo = estimateBallotsCounted(data, raceName);
    const percentCounted = ballotInfo.percentCounted.toFixed(1);

    let statusBadge = '';
    let statusMessage = '';

    if (ballotInfo.percentCounted < 60) {
        statusBadge = '<span class="status-badge early-count">Early Count</span>';
        statusMessage = 'More ballots being counted';
    } else if (ballotInfo.percentCounted < 90) {
        statusBadge = '<span class="status-badge counting">Counting Continues</span>';
        statusMessage = 'More ballots being counted';
    } else {
        statusBadge = '<span class="status-badge late-count">Late Count</span>';
        statusMessage = 'Final ballots being counted';
    }

    const votesCountedFormatted = ballotInfo.totalVotesCounted.toLocaleString('en-US', {
        maximumFractionDigits: 0
    });

    let expectedVotesDisplay;
    if (ballotInfo.expectedTotalBallots >= 1000000) {
        expectedVotesDisplay = '~' + (ballotInfo.expectedTotalBallots / 1000000).toFixed(1) + 'M expected votes';
    } else {
        expectedVotesDisplay = '~' + (ballotInfo.expectedTotalBallots / 1000).toFixed(0) + 'K expected votes';
    }

    return '<div class="ballot-count-status">' +
        '<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">' +
            '<div style="font-size: 28px; font-weight: 700; color: #2c5282;">~' + percentCounted + '%</div>' +
            '<div style="flex: 1;">' +
                '<div style="font-size: 13px; color: #4a5568; font-weight: 600;">Estimated ballots counted</div>' +
                '<div style="font-size: 12px; color: #718096;">' + votesCountedFormatted + ' of ' + expectedVotesDisplay + '</div>' +
            '</div>' +
            statusBadge +
        '</div>' +
        '<div class="progress-bar" style="height: 6px; margin-top: 8px;">' +
            '<div class="progress-fill" style="width: ' + percentCounted + '%; background: #3182ce;"></div>' +
        '</div>' +
        '<div style="font-size: 11px; color: #718096; margin-top: 6px; font-style: italic;">' +
            statusMessage + ' • Updated ' + (reportingTime || 'recently') +
        '</div>' +
    '</div>';
}

// Add timeout to fetch requests
async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function tryEndpoints(raceName, endpoints) {
    for (const endpoint of endpoints) {
        try {
            console.log('Trying endpoint:', endpoint);
            const response = await fetchWithTimeout(endpoint);

            if (response.ok) {
                const data = await response.json();
                console.log('Success:', endpoint);
                return { success: true, data, endpoint };
            } else {
                console.log('Failed:', endpoint, response.status);
            }
        } catch (err) {
            console.log('Error:', endpoint, err.message);
        }
    }

    return { success: false };
}

function renderLinkOnlyRace(raceName, ballotpediaUrl = null) {
    return '<div class="race">' +
        '<div class="race-header">' +
            '<div class="race-title">' + raceName + '</div>' +
        '</div>' +
        '<p style="color: #718096; font-size: 14px; margin-bottom: 10px;">View results on official sources:</p>' +
        '<div style="display: flex; gap: 10px; flex-wrap: wrap;">' +
            '<a href="https://electionresults.sos.ca.gov/" target="_blank" class="link-button">CA Secretary of State →</a>' +
            (ballotpediaUrl ? '<a href="' + ballotpediaUrl + '" target="_blank" class="link-button" style="background: #3182ce;">Ballotpedia →</a>' : '') +
        '</div>' +
    '</div>';
}

function toggleShowAll(raceId) {
    const hiddenCandidates = document.querySelectorAll('[data-race="' + raceId + '"].hidden');
    const btn = document.querySelector('[data-race-btn="' + raceId + '"]');
    const collapsedInfo = document.querySelector('[data-collapsed="' + raceId + '"]');

    if (hiddenCandidates[0] && hiddenCandidates[0].classList.contains('hidden')) {
        hiddenCandidates.forEach(el => el.classList.remove('hidden'));
        btn.textContent = 'Show fewer';
        if (collapsedInfo) collapsedInfo.style.display = 'none';
    } else {
        hiddenCandidates.forEach(el => el.classList.add('hidden'));
        const totalCount = hiddenCandidates.length + CANDIDATES_TO_SHOW;
        btn.textContent = 'Show all ' + totalCount + ' candidates';
        if (collapsedInfo) collapsedInfo.style.display = 'block';
    }
}

function renderRace(raceName, data) {
    let candidates = data.candidates || [];
    let reportingTime = data.ReportingTime || '';

    if (!candidates || candidates.length === 0) {
        return renderLinkOnlyRace(raceName);
    }

    const sortedCandidates = [...candidates].sort((a, b) =>
        parseVotes(b.Votes) - parseVotes(a.Votes)
    );

    const raceId = raceName.replace(/\s+/g, '-').toLowerCase();
    const hasManyCandidates = sortedCandidates.length > CANDIDATES_TO_SHOW;

    const ballotCountHTML = renderBallotCountStatus(data, reportingTime, raceName);

    const candidatesHTML = sortedCandidates
    .map((candidate, index) => {
        const name = candidate.Name || 'Unknown';
        const votes = candidate.Votes || '0';
        const party = candidate.Party || '';
        const percent = parsePercent(candidate.Percent);

        const isTopCandidate = index < CANDIDATES_TO_SHOW;
        const hiddenClass = !isTopCandidate && hasManyCandidates ? 'hidden' : '';
        const topClass = index < 2 ? 'top-candidate' : '';

        const showProgressBar = percent >= MIN_PERCENT_FOR_BAR;
        const compactClass = !showProgressBar ? 'compact-candidate' : '';

        const rankNum = index + 1;
        let rankBadge = '';
        if (index < 2) {
            rankBadge = '<span class="candidate-rank rank-' + rankNum + '">' + rankNum + '</span>';
        }

        const partyBadge = party ? '<span class="party ' + party + '">' + party + '</span>' : '';

        const progressBar = showProgressBar ?
            '<div class="progress-bar">' +
                '<div class="progress-fill ' + (index === 0 ? 'leading' : '') + '" style="width: ' + Math.min(percent, 100) + '%"></div>' +
            '</div>' : '';

        return '<div class="candidate ' + topClass + ' ' + hiddenClass + ' ' + compactClass + '" data-race="' + raceId + '">' +
            '<div class="candidate-info">' +
                '<div class="candidate-name">' +
                    rankBadge + name + partyBadge +
                '</div>' +
                '<div class="votes">' +
                    '<div class="vote-count">' + votes + '</div>' +
                    '<div class="vote-percent">' + percent + '%</div>' +
                '</div>' +
            '</div>' +
            progressBar +
        '</div>';
    })
    .join('');

    const showAllButton = hasManyCandidates ?
        '<button class="show-all-btn" data-race-btn="' + raceId + '" onclick="toggleShowAll(\'' + raceId + '\')">Show all ' + sortedCandidates.length + ' candidates</button>' : '';

    const collapsedInfo = hasManyCandidates ?
        '<div class="collapsed-info" data-collapsed="' + raceId + '">Showing top ' + CANDIDATES_TO_SHOW + ' of ' + sortedCandidates.length + ' candidates</div>' : '';

    const top2 = sortedCandidates.slice(0, 2);
    const topTwoNote = top2.length >= 2 ?
        '<div class="top-two-note">' +
            '<strong>Top 2 Advance to November:</strong> ' +
            top2[0].Name + ' (' + top2[0].Party + ') and ' + top2[1].Name + ' (' + top2[1].Party + ')' +
        '</div>' : '';

    return '<div class="race">' +
        '<div class="race-header">' +
            '<div class="race-title-section">' +
                '<div class="race-title">' + raceName + '</div>' +
            '</div>' +
            showAllButton +
        '</div>' +
        ballotCountHTML +
        candidatesHTML +
        collapsedInfo +
        topTwoNote +
    '</div>';
}

async function fetchFederalResults() {
    const container = document.getElementById('federal-races');
    container.innerHTML = '<div class="loading">⏳ Loading federal results...</div>';

    const races = [
        { name: 'U.S. House District 14', key: 'house14' }
    ];

    let racesHTML = [];

    for (const race of races) {
        const result = await tryEndpoints(race.name, RACE_ENDPOINTS[race.key]);

        if (result.success) {
            racesHTML.push(renderRace(race.name, result.data));
        } else {
            racesHTML.push(renderLinkOnlyRace(
                race.name,
                'https://ballotpedia.org/California%27s_14th_Congressional_District_election,_2026'
            ));
        }
    }

    container.innerHTML = racesHTML.join('');
}

async function fetchStatewideResults() {
    const container = document.getElementById('statewide-races');
    container.innerHTML = '<div class="loading">⏳ Loading statewide results...</div>';

    const races = [
        { name: 'Governor', key: 'governor' },
        { name: 'Lieutenant Governor', key: 'ltGovernor' },
        { name: 'Secretary of State', key: 'secretary' },
        { name: 'Attorney General', key: 'attorneyGeneral' },
        { name: 'Insurance Commissioner', key: 'insurance' },
        { name: 'Controller', key: 'controller' },
        { name: 'Superintendent of Public Instruction', key: 'superintendent' },
        { name: 'Treasurer', key: 'treasurer' },
        { name: 'Board of Equalization District 2', key: 'equalization2' }
    ];

    let racesHTML = [];

    for (const race of races) {
        const result = await tryEndpoints(race.name, RACE_ENDPOINTS[race.key]);

        if (result.success) {
            racesHTML.push(renderRace(race.name, result.data));
        } else {
            racesHTML.push(renderLinkOnlyRace(race.name));
        }
    }

    container.innerHTML = racesHTML.join('');
}

async function fetchLegislativeResults() {
    const container = document.getElementById('legislative-races');
    container.innerHTML = '<div class="loading">⏳ Loading legislative results...</div>';

    const races = [
        { name: 'State Senate District 10', key: 'senate10' },
        { name: 'State Assembly District 20', key: 'assembly20' }
    ];

    let racesHTML = [];

    for (const race of races) {
        const result = await tryEndpoints(race.name, RACE_ENDPOINTS[race.key]);

        if (result.success) {
            racesHTML.push(renderRace(race.name, result.data));
        } else {
            const ballotpediaUrl = race.key === 'senate10'
                ? 'https://ballotpedia.org/California_State_Senate_District_10'
                : 'https://ballotpedia.org/California_State_Assembly_District_20';
            racesHTML.push(renderLinkOnlyRace(race.name, ballotpediaUrl));
        }
    }

    container.innerHTML = racesHTML.join('');
}

function showError(message) {
    const container = document.getElementById('error-container');
    container.innerHTML = '<div class="error">⚠️ ' + message + '</div>';
    setTimeout(function() {
        container.innerHTML = '';
    }, 8000);
}

async function refreshData() {
    document.getElementById('lastUpdate').textContent = 'Updating...';

    try {
        // Fetch all sections but don't wait for failures
        const results = await Promise.allSettled([
            fetchFederalResults(),
            fetchStatewideResults(),
            fetchLegislativeResults()
        ]);

        // Check if any failed
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            console.error('Some sections failed to load:', failures);
        }

        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    } catch (error) {
        showError('Error refreshing data: ' + error.message);
        console.error('Refresh error:', error);
        document.getElementById('lastUpdate').textContent = 'Error - ' + new Date().toLocaleTimeString();
    }
}

function startAutoRefresh() {
    autoRefreshInterval = setInterval(refreshData, 300000); // 5 minutes
}

window.addEventListener('DOMContentLoaded', function() {
    refreshData();
    startAutoRefresh();
});

window.addEventListener('beforeunload', function() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});