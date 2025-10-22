#!/usr/bin/env python3
"""
Test script to make an insecure verbose request to the Superleme API
Tests all endpoints found in background.ts and saves results to test_api.txt
"""

import requests
import json
import urllib3
from datetime import datetime
from bs4 import BeautifulSoup

# Disable SSL warnings for insecure requests
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Base URL
base_url = "https://superleme.abensoft:8443/"

# Endpoints to test
endpoints = {
    "auth_validation": {
        "url": f"{base_url}api/model/sl_cad_interacao_simulacao/get/acessos_agrupados_json",
        "method": "GET",
        "data": None
    },
    "insert_simulation": {
        "url": f"{base_url}api/model/sl_cad_interacao_simulacao/post/insert_simulacao",
        "method": "POST",
        "data": {
            "sim_id": 164,
            "if_id": 1,
            "api_data": {
                "target": "caixa",
                "status": "success",
                "data": {
                    "result": [
                        {
                            "prazo": 397,
                            "tipo_amortizacao": "SAC/TR SBPE (TR): Imóvel vinculado a Empreendimento Financiado na CAIXA - Taxa Balcão",
                            "valor_entrada": 635881.54,
                            "valor_total": 164118.46,
                            "juros_nominais": "10.92% a.a.",
                            "juros_efetivos": "11.49% a.a."
                        },
                        {
                            "prazo": 397,
                            "tipo_amortizacao": "SAC/TR SBPE (TR): Taxa Balcão",
                            "valor_entrada": 642197.21,
                            "valor_total": 157802.79,
                            "juros_nominais": "10.92% a.a.",
                            "juros_efetivos": "11.49% a.a."
                        }
                    ],
                    "message": ""
                }
            }
        }
    }
}

# Headers matching the browser extension
headers = {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'pt-BR,pt;q=0.9',
    'Content-Type': 'application/json',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'priority': 'u=0, i',
    'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
}

# Cookies from the browser
cookies = {
    '_hjSessionUser_3537769': 'eyJpZCI6IjY3YjE0OTdhLTA4MmYtNTk1OS1hOWNmLTc0MjU2OTBhYWQ0ZSIsImNyZWF0ZWQiOjE3NTk0OTQ5ODQ0NTIsImV4aXN0aW5nIjp0cnVlfQ==',
    'cf_clearance': '8ZiN4k8vMrEZeoP39OhLcLcN1DBC0vyd7X2EXVKW9UY-1759755873-1.2.1.1-V1sOlpzcg0s9dtQAPdI1RQXPzKu12BjyitQuk5APaIfY8YrRlYb3jVU7M9MkxhSAWpyaBCfUHkagMhXP9LoOfZvSAL12DNmOuQOFGDbwrMoVb.XCKxyNhZkYpzAa8MoyGzE7u79AdVhAjKR.jssuFmWlyAvv5NsCD9NR.xeJ7.U5FohyELuFczp82JnP_20AVLPz0EBgHiiR_OSGmcsGXdaKsjq8Sk7bt0BsrbLzuPM',
    'cotonic-sid': '13544385-f971-64a7-372b-603db662f21a',
    'startHidden': 'true',
    'timezone': '-03:00',
    'z.auth': 'gHciJPzZYnAxb2dyRxBouRSHYX0FINMyih2N5ULyzlAuq41ypm9aNqFVs1DsTAt2lopulNvu2DiSHFMSmhl2_NmMbt9T-D5dlNSxTgjSsfgS-2QE58WICnpAabhOWk-7SDSZ-PWqSHh8GiOxNyUpSBlwEAMIS8ry0f15ix0BOX4DS1DKsX6h',
    'z.lang': 'en',
    'z.tz': 'America/Sao_Paulo'
}

def test_endpoint(name, endpoint_info, output_file):
    """Test a single endpoint and write results to file"""
    url = endpoint_info['url']
    method = endpoint_info['method']
    data = endpoint_info['data']

    separator = "=" * 80
    output = []

    output.append(separator)
    output.append(f"TESTING ENDPOINT: {name}")
    output.append(separator)
    output.append(f"\nURL: {url}")
    output.append(f"Method: {method}")
    output.append(f"\nHeaders:")
    for key, value in headers.items():
        output.append(f"  {key}: {value}")

    output.append(f"\nCookies:")
    for key, value in cookies.items():
        cookie_display = value[:50] + '...' if len(value) > 50 else value
        output.append(f"  {key}: {cookie_display}")

    if data:
        output.append(f"\nRequest Body:")
        output.append(json.dumps(data, indent=2, ensure_ascii=False))

    output.append(f"\n{separator}")
    output.append("SENDING REQUEST...")
    output.append(f"{separator}\n")

    # Print to console
    for line in output:
        print(line)

    # Write to file
    output_file.write('\n'.join(output) + '\n')

    try:
        # Make the request
        if method == 'GET':
            response = requests.get(
                url,
                headers=headers,
                cookies=cookies,
                verify=False,
                timeout=30
            )
        elif method == 'POST':
            response = requests.post(
                url,
                headers=headers,
                cookies=cookies,
                json=data,
                verify=False,
                timeout=30
            )
        else:
            raise ValueError(f"Unsupported method: {method}")

        result = []
        result.append(f"Response Status Code: {response.status_code}")
        result.append(f"Response Reason: {response.reason}")

        result.append(f"\nResponse Headers:")
        for key, value in response.headers.items():
            result.append(f"  {key}: {value}")

        result.append(f"\nResponse Body:")

        # Determine content type and parse accordingly
        content_type = response.headers.get('Content-Type', '').lower()

        if 'application/json' in content_type:
            try:
                response_json = response.json()
                result.append("[JSON Response]")
                result.append(json.dumps(response_json, indent=2, ensure_ascii=False))
            except json.JSONDecodeError:
                result.append("[JSON Parse Error - Raw Response]")
                result.append(response.text)
        elif 'text/html' in content_type:
            result.append("[HTML Response - Parsed with BeautifulSoup]")
            try:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Get title if exists
                title = soup.find('title')
                if title:
                    result.append(f"\nPage Title: {title.get_text(strip=True)}")

                # Get main headings
                headings = soup.find_all(['h1', 'h2', 'h3'])
                if headings:
                    result.append(f"\nHeadings Found ({len(headings)}):")
                    for h in headings[:10]:  # Limit to first 10
                        result.append(f"  {h.name}: {h.get_text(strip=True)[:100]}")

                # Get body text (first 1000 chars)
                body = soup.find('body')
                if body:
                    body_text = body.get_text(separator=' ', strip=True)
                    result.append(f"\nBody Text (first 1000 chars):")
                    result.append(body_text[:1000])
                    if len(body_text) > 1000:
                        result.append("... (truncated)")

                # Get forms if any
                forms = soup.find_all('form')
                if forms:
                    result.append(f"\nForms Found ({len(forms)}):")
                    for i, form in enumerate(forms[:5]):  # Limit to first 5
                        action = form.get('action', 'N/A')
                        method = form.get('method', 'N/A')
                        result.append(f"  Form {i+1}: action={action}, method={method}")

                # Show pretty-printed HTML (first 2000 chars)
                result.append(f"\n[Prettified HTML - First 2000 chars]:")
                pretty_html = soup.prettify()
                result.append(pretty_html[:2000])
                if len(pretty_html) > 2000:
                    result.append("... (truncated)")

            except Exception as e:
                result.append(f"[Error parsing HTML with BeautifulSoup: {e}]")
                result.append("[Raw HTML Response - First 2000 chars]:")
                result.append(response.text[:2000])
                if len(response.text) > 2000:
                    result.append("... (truncated)")
        else:
            # Unknown content type, show raw
            result.append(f"[Unknown Content-Type: {content_type}]")
            result.append("[Raw Response - First 2000 chars]:")
            result.append(response.text[:2000])
            if len(response.text) > 2000:
                result.append("... (truncated)")

        result.append(f"\n{separator}")
        if response.status_code == 200:
            result.append("✓ REQUEST SUCCESSFUL!")
        else:
            result.append(f"✗ REQUEST FAILED WITH STATUS {response.status_code}")
        result.append(f"{separator}\n")

        # Print and write results
        for line in result:
            print(line)
            output_file.write(line + '\n')

        return response
        
    except requests.exceptions.SSLError as e:
        error_msg = f"SSL Error: {e}\nTry running with verify=False (already set)"
        print(error_msg)
        output_file.write(error_msg + '\n')
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection Error: {e}\nMake sure the server is accessible"
        print(error_msg)
        output_file.write(error_msg + '\n')
    except requests.exceptions.Timeout as e:
        error_msg = f"Timeout Error: {e}"
        print(error_msg)
        output_file.write(error_msg + '\n')
    except Exception as e:
        error_msg = f"Unexpected Error: {type(e).__name__}: {e}"
        print(error_msg)
        output_file.write(error_msg + '\n')
        import traceback
        tb = traceback.format_exc()
        print(tb)
        output_file.write(tb + '\n')

    output_file.write('\n\n')
    return None

def main():
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with open('test_api.txt', 'w', encoding='utf-8') as f:
        f.write("=" * 80 + '\n')
        f.write("SUPERLEME API ENDPOINT TESTS\n")
        f.write(f"Test executed at: {timestamp}\n")
        f.write("=" * 80 + '\n\n')

        print("=" * 80)
        print("SUPERLEME API ENDPOINT TESTS")
        print(f"Test executed at: {timestamp}")
        print("=" * 80 + '\n')

        # Test all endpoints
        for name, endpoint_info in endpoints.items():
            test_endpoint(name, endpoint_info, f)
            print("\n")

        summary = f"\n{'=' * 80}\nTEST COMPLETED\n{'=' * 80}\n"
        summary += f"Total endpoints tested: {len(endpoints)}\n"
        summary += f"Results saved to: test_api.txt\n"
        summary += "=" * 80 + "\n"

        print(summary)
        f.write(summary)

if __name__ == "__main__":
    main()
